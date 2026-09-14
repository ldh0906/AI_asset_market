import type { Version } from './model';

export function contentFormat(version: Version) {
  return version.contentFormat ?? (version.fileName === 'SKILL.md' ? 'agent-skill' : version.fileName.endsWith('.json') ? 'workflow' : 'document');
}
// Documents supply reference context; typed transformations keep their selected order.
export function compositionShape(versions: Version[]) {
  const steps = versions.filter(v => contentFormat(v) !== 'document');
  if (!steps.length) return { input: 'text', output: 'text' } as const;
  for (let i = 1; i < steps.length; i++) if (steps[i - 1].output !== steps[i].input) throw new Error('구성품 사이의 입력·출력 형식이 맞지 않습니다.');
  return { input: steps[0].input, output: steps.at(-1)!.output };
}
