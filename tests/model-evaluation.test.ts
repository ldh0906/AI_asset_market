import { describe, expect, it } from 'vitest';
import { parseSkillFile } from '../src/domain/skill-file';
import { casesFor, estimatedCost, grade, planTrials, runTrial, summarize, variantsFor, type EvaluationAsset, type ModelReply, type Trial } from '../src/ai/evaluation';
import { hashText } from '../src/domain/hash';
import { ENVIRONMENT } from '../src/domain/model';

const skillText = '---\nname: code-review\ndescription: Check code using fixed patterns.\nallowed-tools: code.review\n---\nReview the supplied code and return findings as JSON.';
function asset(id = 'a', price = '100'): EvaluationAsset {
  return { title: id, text: skillText, productPrice: price, version: { id, assetId: id, ownerId: 'owner', version: '1.0.0', fileName: 'SKILL.md', contentFormat: 'agent-skill', fileHash: hashText(skillText), storagePath: '', capabilities: ['code-review'], input: 'code', output: 'json', environment: ENVIRONMENT, license: 'same', licenseHash: hashText('same'), limitations: [], state: 'draft', createdAt: '' } };
}
const answer = (result: string, changes: Partial<ModelReply> = {}): ModelReply => ({ status: 'completed', model: 'fixed-model-test', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 25 } }, ...changes });

describe('single-file Agent Skills scope', () => {
  it('reads standard metadata, multiline description, BOM and optional tools', () => {
    expect(parseSkillFile('\ufeff' + skillText).tools).toEqual(['code.review']);
    const plain = skillText.replace('description: Check code using fixed patterns.', 'description: |\n  Check code.\n  Return findings.').replace('allowed-tools: code.review\n', '');
    expect(parseSkillFile(plain).tools).toEqual([]);
    expect(parseSkillFile(plain).description).toContain('Return findings.');
  });
  it('rejects unsupported tools, missing dependencies and invalid or ambiguous YAML', () => {
    for (const text of [skillText.replace('name: code-review', 'name: Upper_Case'), skillText.replace('name: code-review', 'name: a--b'), skillText.replace('allowed-tools: code.review', 'allowed-tools: Bash'), skillText.replace('name: code-review', 'name: first\nname: second'), skillText.replace('description: Check code using fixed patterns.', 'description: !custom value'), skillText.replace('name: code-review', 'name: &a code-review').replace('description: Check code using fixed patterns.', 'description: *a'), skillText + '\nRead [dependency](rules.md).', skillText + '\nRun scripts/check.py.', 'No metadata header']) expect(() => parseSkillFile(text)).toThrow();
  });
});
describe('real model comparison orchestration with isolated test providers', () => {
  it('uses identical interleaved tasks and repeats for baseline, every single and set', () => {
    const a = asset(), b = asset('b', '50'); b.version.input = 'json'; b.version.output = 'markdown';
    const assets = [a, b], variants = variantsFor(assets, '140'), cases = casesFor(assets), plan = planTrials(variants, cases);
    expect(variants.map(v => v.indices)).toEqual([[], [0], [1], [0, 1]]);
    expect(plan.slice(0, 4)).toEqual([0, 1, 2, 3].map(variant => ({ variant, caseIndex: 0, repeat: 0 })));
    expect(plan).toHaveLength(24);
    for (let variant = 0; variant < 4; variant++) expect(plan.filter(p => p.variant === variant).map(({ caseIndex, repeat }) => [caseIndex, repeat])).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
  });
  it('executes only a selected asset’s allowed tool and records actual response usage without retaining paid output', async () => {
    const a = asset(), c = casesFor([a])[0]; const requests: unknown[][] = [];
    const trial = await runTrial({ async respond(input, tools) {
      requests.push(structuredClone(input)); expect(tools).toHaveLength(1);
      if (requests.length === 1) return answer('', { output: [{ type: 'function_call', name: 'run_market_tool', call_id: 'call-1', arguments: JSON.stringify({ tool: 'code.review', input: c.input }) }] });
      expect(input.at(-1)).toMatchObject({ type: 'function_call_output', call_id: 'call-1', output: JSON.stringify({ type: 'code-review', findings: c.expected }) });
      return answer(JSON.stringify({ type: 'code-review', findings: c.expected }));
    } }, 'fixed-model-test', [a], c, 1, 0, 0);
    expect(trial.passed).toBe(true); expect(trial.requests).toBe(2);
    expect(trial.usage).toEqual({ inputTokens: 200, cachedInputTokens: 50, outputTokens: 40 });
    expect(trial.outputHash).toMatch(/^0x[a-f0-9]{64}$/); expect(trial).not.toHaveProperty('output');
  });
  it('gives baseline no paid content or tools and rejects tool escalation', async () => {
    const c = casesFor([asset()])[0];
    await runTrial({ async respond(input, tools) { expect(tools).toEqual([]); expect(JSON.parse((input[0] as any).content).assets).toEqual([]); return answer('wrong'); } }, 'fixed-model-test', [], c, 0, 0, 0);
    await expect(runTrial({ async respond() { return answer('', { output: [{ type: 'function_call', name: 'run_market_tool', arguments: JSON.stringify({ tool: 'report.markdown', input: '{}' }), call_id: '1' }] }); } }, 'fixed-model-test', [asset()], c, 1, 0, 0)).rejects.toThrow('허용하지 않은');
  });
  it('rejects incomplete, refused and invalid token responses instead of inventing scores', async () => {
    const c = casesFor([asset()])[0];
    const bad: ModelReply[] = [answer('', { status: 'incomplete' }), answer('', { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }), answer('', { usage: undefined }), answer('', { usage: { input_tokens: -1, output_tokens: 1 } }), answer('', { usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 2 } } })];
    for (const response of bad) await expect(runTrial({ async respond() { return response; } }, 'fixed-model-test', [], c, 0, 0, 0)).rejects.toThrow();
  });
  it('does not give credit for wrong row totals or swapped rule locations', () => {
    const a = asset(); a.version.output = 'markdown'; const code = casesFor([a])[1];
    expect(grade(code, '# Result\n- secret-literal: 2행\n- html-assignment: 1행')).toBe(false);
    expect(grade(code, '# Result\n- secret-literal: 1행\n- html-assignment: 2행')).toBe(true);
    a.version.input = 'csv'; const csv = casesFor([a])[0];
    expect(grade(csv, '# Result\n| alpha | 120 |\n| beta | 77 |')).toBe(false);
    expect(grade(csv, '# Result\n| alpha | 20 |\n| beta | 7 |\n| extra | 1 |')).toBe(false);
    expect(grade(csv, '# Result\n| beta | 7 |\n| alpha | 20 |')).toBe(true);
  });
  it('scores document evidence separately and rejects incompatible typed steps', () => {
    const a = asset(), doc = asset('doc'); doc.version.contentFormat = 'document'; doc.text = '# Source heading\nReference content.';
    expect(casesFor([a, doc]).at(-1)).toMatchObject({ grader: 'exact', expected: 'Source heading' });
    expect(() => casesFor([a, asset('b')])).toThrow('입력·출력');
  });
  it('requires all comparable results and chooses best single by measured score, then known price', () => {
    const a = asset(), b = asset('b', '50'); b.version.input = 'json'; b.version.output = 'markdown';
    const assets = [a, b], variants = variantsFor(assets, '140'), cases = casesFor(assets);
    const trials: Trial[] = planTrials(variants, cases).map(p => ({ ...p, passed: p.variant !== 0, detail: 'test-only', outputHash: hashText('test'), durationMs: 100, usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10 }, requests: 1, model: 'fixed-model-test' }));
    const report = summarize('test-job', assets, variants, cases, trials, 2, null);
    expect(report.bestSingleIndex).toBe(2); expect(report.estimatedCostUsd).toBeNull();
    expect(report.comparisons.map(c => c.total)).toEqual([6, 6, 6, 6]);
    expect(() => summarize('test', assets, variants, cases, trials.slice(1), 2, null)).toThrow('같은 과제');
    expect(() => summarize('test', assets, variants, cases, trials.map((t, i) => i ? t : { ...t, model: 'another-model' }), 2, null)).toThrow('서로 다른');
    expect(estimatedCost({ inputTokens: 1000000, cachedInputTokens: 200000, outputTokens: 100000 }, { input: 2, cachedInput: 1, output: 8, source: 'test-only rates' })).toBeCloseTo(2.6);
  });
});
