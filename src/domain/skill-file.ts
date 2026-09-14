import { parseDocument } from 'yaml';
import { z } from 'zod';
export const supportedTools = ['code.review', 'csv.summarize', 'report.markdown'] as const;
const frontmatterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(1024),
  license: z.string().max(1024).optional(), compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(), 'allowed-tools': z.string().max(500).optional(),
}).strict();
export function parseSkillFile(text: string) {
  if (text.length > 100000) throw new Error('SKILL.md는 100,000자 이하로 등록하세요.');
  const match = text.replace(/^\ufeff/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md의 YAML 머리말과 본문을 확인하세요.');
  const document = parseDocument(match[1], { uniqueKeys: true, schema: 'core' });
  if (document.errors.length || document.warnings.length) throw new Error('지원하지 않는 YAML 형식입니다. 중복 키·사용자 태그를 제거하세요.');
  let metadata: z.infer<typeof frontmatterSchema>;
  try { metadata = frontmatterSchema.parse(document.toJS({ maxAliasCount: 0 })); }
  catch { throw new Error('Skill의 name·description 또는 메타데이터 형식이 올바르지 않습니다.'); }
  const tools = (metadata['allowed-tools'] ?? '').trim().split(/\s+/).filter(Boolean);
  if (tools.some(tool => !supportedTools.includes(tool as typeof supportedTools[number]))) throw new Error('허용 도구는 code.review, csv.summarize, report.markdown입니다. 다른 실행 도구는 현재 지원하지 않습니다.');
  const body = match[2].trim();
  if (body.length < 20) throw new Error('Skill의 작업 지시 본문을 20자 이상 작성하세요.');
  if (/(?:\b(?:scripts|references|assets)\/[^\s)`]+)|\]\((?!https?:|#)[^)]+\)/i.test(body)) throw new Error('추가 파일을 참조하는 Skill은 해당 파일을 포함한 패키지 지원이 필요합니다. 현재는 단일 SKILL.md만 등록하세요.');
  return { name: metadata.name, description: metadata.description, body, tools: [...new Set(tools)], metadata };
}
