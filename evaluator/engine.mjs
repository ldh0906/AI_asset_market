// Trusted, bounded tools only. Uploaded JSON is never interpreted as JavaScript or shell.
export const definitions = {
  'code.review': { input: 'code', output: 'json', capabilities: ['code-review'] },
  'csv.summarize': { input: 'csv', output: 'json', capabilities: ['data-summary'] },
  'report.markdown': { input: 'json', output: 'markdown', capabilities: ['report'] },
};
export function describe(manifest) {
  if (manifest?.schemaVersion !== 1 || Object.keys(manifest).some(k => !['schemaVersion', 'steps'].includes(k)) || !Array.isArray(manifest.steps) || !manifest.steps.length || manifest.steps.length > 3) throw new Error('지원하는 Skill 선언 형식이 아닙니다.');
  const steps = manifest.steps.map(step => {
    if (!step || Object.keys(step).length !== 1 || !Object.hasOwn(definitions, step.tool)) throw new Error('허용되지 않은 도구 또는 실행 옵션입니다.');
    return definitions[step.tool];
  });
  for (let i = 1; i < steps.length; i++) if (steps[i - 1].output !== steps[i].input) throw new Error('도구 간 입출력 형식이 맞지 않습니다.');
  return { input: steps[0].input, output: steps.at(-1).output, capabilities: [...new Set(steps.flatMap(s => s.capabilities))] };
}
function review(code) {
  if (typeof code !== 'string' || code.length > 100000) throw new Error('코드 입력 크기를 확인하세요.');
  const rules = [
    ['dynamic-eval', /\beval\s*\(/],
    ['secret-literal', /(?:api[_-]?key|password|secret)\s*[:=]\s*["'][^"']{3,}["']/i],
    ['html-assignment', /\.innerHTML\s*=/],
  ];
  const findings = [];
  code.split('\n').forEach((line, i) => rules.forEach(([rule, regex]) => { if (regex.test(line)) findings.push({ rule, line: i + 1 }); }));
  return { type: 'code-review', findings };
}
function summarize(csv) {
  if (typeof csv !== 'string' || csv.length > 100000) throw new Error('CSV 입력 크기를 확인하세요.');
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || lines.length > 1001 || lines[0].trim() !== 'group,amount' || /["']/.test(csv)) throw new Error('group,amount 헤더의 단순 CSV만 지원합니다.');
  const groups = new Map();
  for (const line of lines.slice(1)) {
    const [group, amount, extra] = line.split(',');
    if (!group || extra !== undefined || !/^-?\d{1,6}$/.test(amount ?? '')) throw new Error('그룹과 정수 금액을 확인하세요.');
    groups.set(group, (groups.get(group) ?? 0) + Number(amount));
  }
  return { type: 'data-summary', groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, amount]) => ({ group, amount })) };
}
const escape = value => String(value).replace(/[|\r\n<>]/g, ' ');
function report(data) {
  if (data?.type === 'code-review' && Array.isArray(data.findings)) return '# 코드 점검 보고서\n\n' + (data.findings.length ? data.findings.map(f => `- ${escape(f.rule)}: ${escape(f.line)}행`).join('\n') : '검사한 규칙에서 발견된 항목이 없습니다.');
  if (data?.type === 'data-summary' && Array.isArray(data.groups)) return '# 데이터 집계 보고서\n\n| 그룹 | 합계 |\n|---|---:|\n' + data.groups.map(r => `| ${escape(r.group)} | ${escape(r.amount)} |`).join('\n');
  throw new Error('code-review 또는 data-summary 형식의 JSON이 필요합니다.');
}
export function run(manifests, input) {
  let value = input;
  for (const manifest of manifests) {
    describe(manifest);
    for (const step of manifest.steps) {
      value = step.tool === 'code.review' ? review(value) : step.tool === 'csv.summarize' ? summarize(value) : report(value);
    }
  }
  return value;
}
export function testPipeline(manifests) {
  const start = performance.now();
  const first = describe(manifests[0]), last = describe(manifests.at(-1));
  for (let i = 1; i < manifests.length; i++) if (describe(manifests[i - 1]).output !== describe(manifests[i]).input) throw new Error('조합의 데이터 전달 형식이 다릅니다.');
  const samples = first.input === 'code' ? [
    ['동적 실행 탐지', 'eval(input)', v => JSON.stringify(v).includes('dynamic-eval')],
    ['문자열 비밀값 탐지', 'const password = "example-only";', v => JSON.stringify(v).includes('secret-literal')],
    ['HTML 대입 탐지', 'element.innerHTML = input;', v => JSON.stringify(v).includes('html-assignment')],
    ['정상 코드', 'const total = values.reduce((a, b) => a + b, 0);', v => typeof v === 'string' ? v.includes('발견된 항목이 없습니다') : v.findings.length === 0],
    ['검사 행 위치', '\n\neval(input)', v => typeof v === 'string' ? v.includes('3행') : v.findings.some(f => f.line === 3)],
  ] : first.input === 'csv' ? [
    ['그룹 합산', 'group,amount\na,10\na,20\nb,5', v => typeof v === 'string' ? v.includes('| a | 30 |') : v.groups.some(g => g.group === 'a' && g.amount === 30)],
    ['음수 금액', 'group,amount\na,10\na,-4', v => typeof v === 'string' ? v.includes('| a | 6 |') : v.groups[0].amount === 6],
    ['0원 항목', 'group,amount\na,0', v => typeof v === 'string' ? v.includes('| a | 0 |') : v.groups[0].amount === 0],
  ] : [
    ['점검 보고서', { type: 'code-review', findings: [{ rule: 'dynamic-eval', line: 4 }] }, v => v.includes('dynamic-eval') && v.includes('4행')],
    ['집계 보고서', { type: 'data-summary', groups: [{ group: 'a', amount: 20 }] }, v => v.includes('| a | 20 |')],
    ['빈 점검 보고서', { type: 'code-review', findings: [] }, v => v.includes('발견된 항목이 없습니다')],
  ];
  const cases = samples.map(([name, input, check]) => {
    try { const output = run(manifests, input); const format = last.output === 'markdown' ? typeof output === 'string' && output.startsWith('# ') : typeof output === 'object'; return { name, passed: !!check(output) && format, detail: '고정 입력·명시적 규칙으로 결과와 출력 형식을 비교했습니다.' }; }
    catch { return { name, passed: false, detail: '시험 입력을 처리하지 못했습니다.' }; }
  });
  return { task: `${first.input} → ${last.output} 고정 과제`, cases, passed: cases.filter(c => c.passed).length, total: cases.length, durationMs: performance.now() - start };
}
export function scan(text, kind) {
  const findings = [];
  if (/(?:ignore|disregard)\s+(?:all\s+)?(?:previous|system)\s+instructions|이전\s*지시.*무시/i.test(text)) findings.push('검사 지시 변경을 유도하는 문자열');
  if (/https?:\/\//i.test(text)) findings.push('외부 URL 참조: 내용을 가져오거나 실행하지 않음');
  if (/<script\b|javascript:/i.test(text)) findings.push('스크립트 실행 표현');
  if (kind === 'skill') { try { describe(JSON.parse(text)); } catch (e) { findings.push(e.message); } }
  return { findings, scanned: ['업로드 원문 전체', '허용 도구와 옵션', '외부 참조 문자열', '일부 지시 변경 패턴'],
    untested: ['저작권 소유 여부', '전문 지식의 사실성', '지원하지 않는 코드 실행 환경'],
    knownMisses: ['난독화·다국어 우회 지시는 문자열 검사로 놓칠 수 있음', '코드 점검 도구는 별칭을 통한 eval 호출을 탐지하지 못함'] };
}
