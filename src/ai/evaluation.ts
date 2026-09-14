import { z } from 'zod';
import type { Usage, Version, ModelEvaluation, ModelVariantResult } from '../domain/model';
import { hashObject, hashText } from '../domain/hash';
import { parseSkillFile, supportedTools } from '../domain/skill-file';
import { run } from '../../evaluator/engine.mjs';
import { contentFormat, compositionShape } from '../domain/composition';

export interface EvaluationAsset { version: Version; text: string; title: string; productPrice: string | null }
export interface Variant { label: string; indices: number[]; productPrice: string | null }
export interface Case { id: string; name: string; prompt: string; input: unknown; expected: unknown; grader: 'code-json' | 'code-markdown' | 'csv-json' | 'csv-markdown' | 'report' | 'exact'; }
export interface Trial { variant: number; caseIndex: number; repeat: number; passed: boolean; detail: string; outputHash: string; durationMs: number; usage: Usage; requests: number; model: string }
export interface ModelReply { status: string; model: string; output: any[]; usage?: { input_tokens: number; output_tokens: number; input_tokens_details?: { cached_tokens?: number } } }
export interface Provider { respond(input: unknown[], tools: unknown[], model: string, signal: AbortSignal): Promise<ModelReply> }
export const SUITE_VERSION = 'market-model-cases/1.0.0';
export const emptyUsage = (): Usage => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
export function addUsage(a: Usage, b: Usage): Usage { return { inputTokens: a.inputTokens + b.inputTokens, cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens, outputTokens: a.outputTokens + b.outputTokens }; }
export const formatOf = contentFormat;
export function variantsFor(assets: EvaluationAsset[], setPrice: string | null): Variant[] {
  return [{ label: '기본 AI', indices: [], productPrice: '0' }, ...assets.map((a, i) => ({ label: `단품: ${a.title}`, indices: [i], productPrice: a.productPrice })),
    ...(assets.length > 1 ? [{ label: '전체 구성', indices: assets.map((_, i) => i), productPrice: setPrice }] : [])];
}
export function casesFor(assets: EvaluationAsset[]): Case[] {
  compositionShape(assets.map(a => a.version));
  const main = assets.find(a => formatOf(a.version) !== 'document'), last = assets.filter(a => formatOf(a.version) !== 'document').at(-1);
  const cases: Case[] = [];
  if (main?.version.input === 'code') {
    if (!['json', 'markdown'].includes(last!.version.output)) throw new Error('현재 코드 시험은 JSON 또는 Markdown 출력을 지원합니다.');
    const markdown = last!.version.output === 'markdown';
    const prompt = `코드의 eval 직접 호출은 dynamic-eval, 문자열 비밀값 대입은 secret-literal, innerHTML 대입은 html-assignment로 표시하세요. 이 세 패턴만 검사하고 1부터 세는 행 번호를 포함하세요. ${markdown ? '제목이 있는 Markdown 보고서로 작성하고 발견이 없으면 "발견된 항목이 없습니다"라고 쓰세요.' : '결과는 {"type":"code-review","findings":[{"rule":"규칙명","line":행번호}]} 형식의 JSON입니다.'}`;
    for (const [id, input, expected] of [
      ['dynamic', 'const input = "sample";\neval(input);', [{ rule: 'dynamic-eval', line: 2 }]],
      ['secret', 'const secret = "example-only";\nelement.innerHTML = input;', [{ rule: 'secret-literal', line: 1 }, { rule: 'html-assignment', line: 2 }]],
      ['normal', 'const sum = [1, 2, 3].reduce((a, b) => a + b, 0);', []],
    ] as const) cases.push({ id, name: `코드 규칙 검사: ${id}`, input, expected, prompt, grader: markdown ? 'code-markdown' : 'code-json' });
  } else if (main?.version.input === 'csv') {
    const markdown = last!.version.output === 'markdown';
    if (!['json', 'markdown'].includes(last!.version.output)) throw new Error('현재 CSV 시험은 JSON 또는 Markdown 출력을 지원합니다.');
    for (const [id, input, expected] of [
      ['groups', 'group,amount\nalpha,12\nbeta,7\nalpha,8', [{ group: 'alpha', amount: 20 }, { group: 'beta', amount: 7 }]],
      ['negative', 'group,amount\nalpha,10\nalpha,-3', [{ group: 'alpha', amount: 7 }]],
      ['zero', 'group,amount\nalpha,0', [{ group: 'alpha', amount: 0 }]],
    ] as const) cases.push({ id, name: `그룹 합산: ${id}`, input, expected,
      prompt: `입력 CSV를 그룹별로 합산하세요. ${markdown ? '제목이 있는 Markdown 표로 그룹과 합계를 표시하세요.' : '결과는 {"type":"data-summary","groups":[{"group":"이름","amount":합계}]} JSON입니다.'}`,
      grader: markdown ? 'csv-markdown' : 'csv-json' });
  } else if (main?.version.input === 'json' && last?.version.output === 'markdown') {
    cases.push({ id: 'report-code', name: '코드 점검 보고서', input: { type: 'code-review', findings: [{ rule: 'dynamic-eval', line: 4 }] }, expected: ['dynamic-eval', '4'], prompt: '입력 JSON을 제목이 있는 Markdown 보고서로 바꾸고 모든 항목을 보존하세요.', grader: 'report' },
      { id: 'report-data', name: '데이터 집계 보고서', input: { type: 'data-summary', groups: [{ group: 'alpha', amount: 27 }, { group: 'beta', amount: -3 }] }, expected: ['alpha', '27', 'beta', '-3'], prompt: '입력 JSON을 제목이 있는 Markdown 보고서로 바꾸고 모든 항목을 보존하세요.', grader: 'report' });
  } else if (main) throw new Error('이 입력·출력 조합의 모델 평가 과제는 아직 등록되지 않았습니다.');
  const documents = assets.filter(a => formatOf(a.version) === 'document');
  if (documents.length) {
    for (const document of documents) {
      const lines = document.text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const heading = lines.find(l => /^#{1,6}\s+/.test(l));
      const expected = heading ? heading.replace(/^#{1,6}\s+/, '') : lines[0];
      if (!expected) throw new Error('문서 본문이 비어 있습니다.');
      cases.push({ id: `document-${document.version.id}`, name: `문서 근거 확인: ${document.title}`, input: '원문 근거 확인', expected,
        prompt: `참조 문서 "${document.title}"의 첫 Markdown 제목 텍스트를 그대로 반환하세요. 제목이 없으면 첫 번째 비어 있지 않은 줄을 반환하세요. 제목 기호나 설명을 덧붙이지 마세요. 문서가 없으면 "근거 없음"이라고 답하세요.`, grader: 'exact' });
    }
  }
  if (!cases.length) throw new Error('시험할 과제가 없습니다.');
  return cases;
}
export function grade(c: Case, output: string): boolean {
  try {
    if (c.grader === 'exact') return output.trim() === c.expected;
    if (c.grader === 'code-json') {
      const answer = JSON.parse(output); return answer.type === 'code-review' && hashObject(answer.findings) === hashObject(c.expected);
    }
    if (c.grader === 'csv-json') {
      const answer = JSON.parse(output);
      return answer.type === 'data-summary' && hashObject(answer.groups?.sort((a: any, b: any) => a.group.localeCompare(b.group))) === hashObject(c.expected);
    }
    if (!/^#{1,6}\s/m.test(output)) return false;
    if (c.grader === 'code-markdown') {
      const findings = c.expected as { rule: string; line: number }[];
      if (!findings.length) return output.includes('발견된 항목이 없습니다') && !['dynamic-eval', 'secret-literal', 'html-assignment'].some(r => output.includes(r));
      return findings.every(f => output.split('\n').some(line => line.includes(f.rule) && new RegExp(`(?<![\\d.-])${f.line}(?![\\d.])`).test(line))) && ['dynamic-eval', 'secret-literal', 'html-assignment'].filter(r => !findings.some(f => f.rule === r)).every(r => !output.includes(r));
    }
    if (c.grader === 'csv-markdown') return tableMatches(output, c.expected as { group: string; amount: number }[]);
    const data = c.input as { type: string; findings?: { rule: string; line: number }[]; groups?: { group: string; amount: number }[] };
    return data.type === 'data-summary' ? tableMatches(output, data.groups!) : data.findings!.every(f => output.split('\n').some(line => line.includes(f.rule) && new RegExp(`(?<![\\d.-])${f.line}(?![\\d.])`).test(line)));
  } catch { return false; }
}
function tableMatches(output: string, expected: { group: string; amount: number }[]) {
  const rows = output.split('\n').filter(line => line.trim().startsWith('|')).map(line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim().replace(/[*`]/g, '')))
    .filter(cells => cells.length === 2 && /^-?\d+$/.test(cells[1])).map(cells => ({ group: cells[0], amount: Number(cells[1]) })).sort((a, b) => a.group.localeCompare(b.group));
  return hashObject(rows) === hashObject([...expected].sort((a, b) => a.group.localeCompare(b.group)));
}
function toolsFor(assets: EvaluationAsset[]) {
  return [...new Set(assets.flatMap(a => formatOf(a.version) === 'workflow' ? JSON.parse(a.text).steps.map((s: { tool: string }) => s.tool) : formatOf(a.version) === 'agent-skill' ? parseSkillFile(a.text).tools : []))] as string[];
}
export async function runTrial(provider: Provider, model: string, assets: EvaluationAsset[], c: Case, variantIndex: number, caseIndex: number, repeat: number): Promise<Trial> {
  const start = performance.now();
  const allowed = toolsFor(assets);
  if (allowed.some(t => !supportedTools.includes(t as typeof supportedTools[number]))) throw new Error('시험에서 허용되지 않은 도구입니다.');
  const tools = allowed.length ? [{ type: 'function', name: 'run_market_tool', description: 'Execute one of the allowed versioned market tools. Input is raw code/CSV or a serialized JSON string for report.markdown.', strict: true,
    parameters: { type: 'object', properties: { tool: { type: 'string', enum: allowed }, input: { type: 'string' } }, required: ['tool', 'input'], additionalProperties: false } }] : [];
  const input: unknown[] = [{ role: 'user', content: JSON.stringify({ task: c.prompt, input: c.input, assets: assets.map(a => ({ title: a.title, format: formatOf(a.version), content: a.text })) }) }];
  const signal = AbortSignal.timeout(40000); let usage = emptyUsage(), resolvedModel = '', requests = 0;
  for (let round = 0; round < 4; round++) {
    const response = await provider.respond(input, tools, resolvedModel || model, signal); requests++;
    if (response.status !== 'completed' || !response.model) throw new Error('모델 시험 응답이 완료되지 않았습니다.');
    if (resolvedModel && response.model !== resolvedModel) throw new Error('시험 도중 모델 버전이 바뀌었습니다.');
    resolvedModel = response.model;
    const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
    if (!response.usage || [response.usage.input_tokens, response.usage.output_tokens, cached].some(n => !Number.isSafeInteger(n) || n < 0) || cached > response.usage.input_tokens) throw new Error('모델 토큰 사용량을 확인할 수 없습니다.');
    usage = addUsage(usage, { inputTokens: response.usage.input_tokens, cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? 0, outputTokens: response.usage.output_tokens });
    const calls = response.output.filter(item => item.type === 'function_call');
    if (calls.length) {
      if (calls.length > 3) throw new Error('시험의 도구 호출 한도를 넘었습니다.');
      input.push(...response.output);
      for (const call of calls) {
        if (call.name !== 'run_market_tool') throw new Error('허용되지 않은 도구 호출입니다.');
        const args = z.object({ tool: z.string(), input: z.string().max(100000) }).strict().parse(JSON.parse(call.arguments));
        if (!allowed.includes(args.tool)) throw new Error('선택한 상품이 허용하지 않은 도구입니다.');
        let result: unknown;
        try { result = run([{ schemaVersion: 1, steps: [{ tool: args.tool }] }], args.tool === 'report.markdown' ? JSON.parse(args.input) : args.input); }
        catch { result = { error: 'unsupported_input' }; }
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result) });
      }
      continue;
    }
    const texts = response.output.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(item => item.type === 'output_text');
    if (texts.length !== 1) throw new Error('모델이 시험 결과를 반환하지 않았습니다.');
    const result = z.object({ result: z.string().max(20000) }).strict().parse(JSON.parse(texts[0].text)).result;
    const passed = grade(c, result);
    return { variant: variantIndex, caseIndex, repeat, passed, detail: passed ? '공개된 판정 규칙을 충족했습니다.' : '출력 형식 또는 기준 답안과 일치하지 않았습니다.', outputHash: hashText(result), durationMs: performance.now() - start, usage, requests, model: resolvedModel };
  }
  throw new Error('모델의 도구 실행 횟수를 초과했습니다.');
}
export function planTrials(variants: Variant[], cases: Case[], repeats = 2) {
  return Array.from({ length: repeats }, (_, repeat) => cases.flatMap((_, caseIndex) => variants.map((_, variant) => ({ variant, caseIndex, repeat })))).flat();
}
export interface Pricing { input: number; cachedInput: number; output: number; source: string }
export function estimatedCost(usage: Usage, pricing: Pricing | null) {
  if (!pricing) return null;
  return ((usage.inputTokens - usage.cachedInputTokens) * pricing.input + usage.cachedInputTokens * pricing.cachedInput + usage.outputTokens * pricing.output) / 1000000;
}
export function summarize(jobId: string, assets: EvaluationAsset[], variants: Variant[], cases: Case[], trials: Trial[], repeats: number, pricing: Pricing | null): ModelEvaluation {
  const plan = planTrials(variants, cases, repeats);
  if (trials.length !== plan.length || plan.some((p, i) => p.caseIndex !== trials[i].caseIndex || p.variant !== trials[i].variant || p.repeat !== trials[i].repeat)) throw new Error('모든 구성에 같은 과제와 반복 횟수의 시험을 완료해야 합니다.');
  if (new Set(trials.map(t => t.model)).size !== 1) throw new Error('서로 다른 모델 결과는 동일 환경 비교로 표시할 수 없습니다.');
  const comparisons: ModelVariantResult[] = variants.map((variant, index) => {
    const rows = trials.filter(t => t.variant === index), usage = rows.reduce((sum, row) => addUsage(sum, row.usage), emptyUsage());
    return { label: variant.label, versionIds: variant.indices.map(i => assets[i].version.id), productPrice: variant.productPrice,
      passed: rows.filter(t => t.passed).length, total: rows.length, durationMs: { mean: rows.reduce((s, t) => s + t.durationMs, 0) / rows.length, min: Math.min(...rows.map(t => t.durationMs)), max: Math.max(...rows.map(t => t.durationMs)) }, usage, estimatedCostUsd: estimatedCost(usage, pricing) };
  });
  const singles = comparisons.map((c, i) => ({ ...c, index: i })).filter(c => c.versionIds.length === 1);
  singles.sort((a, b) => b.passed / b.total - a.passed / a.total || (a.productPrice !== null && b.productPrice !== null ? Number(BigInt(a.productPrice) - BigInt(b.productPrice)) : a.index - b.index));
  return { jobId, model: trials[0].model, suiteVersion: SUITE_VERSION, repeats, trialCount: trials.length, comparisons, bestSingleIndex: singles[0].index,
    caseNames: cases.map(c => c.name), grading: '고정 과제의 정확한 필드·규칙명·행 번호·합계·문서 원문 대조. 사람의 전문 검토 및 통계적 우위 검정은 수행하지 않음.',
    priceSource: pricing?.source ?? null, estimatedCostUsd: estimatedCost(trials.reduce((sum, t) => addUsage(sum, t.usage), emptyUsage()), pricing) };
}
