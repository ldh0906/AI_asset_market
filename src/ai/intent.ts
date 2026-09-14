import { z } from 'zod';
import { capabilities } from '../domain/model';
import { amountSchema, formatSchema } from '../domain/validation';
export const extractedIntentSchema = z.object({
  capabilities: z.array(z.enum(capabilities)).max(4), input: formatSchema.nullable(), output: formatSchema.nullable(),
  budget: amountSchema.nullable(), environment: z.string().trim().min(1).max(120).nullable(),
  questions: z.array(z.string().min(1).max(200)).max(3),
}).strict();
export type ExtractedIntent = z.infer<typeof extractedIntentSchema>;
export const intentJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    capabilities: { type: 'array', items: { type: 'string', enum: [...capabilities] } },
    input: { type: ['string', 'null'], enum: ['code', 'csv', 'json', 'markdown', 'text', null] },
    output: { type: ['string', 'null'], enum: ['code', 'csv', 'json', 'markdown', 'text', null] },
    budget: { type: ['string', 'null'], description: 'Explicit integer maximum product budget in TEST, otherwise null. Never convert other currencies.' },
    environment: { type: ['string', 'null'], description: 'Explicitly requested execution environment, otherwise null. Do not replace it with a supported environment.' },
    questions: { type: 'array', items: { type: 'string' } },
  }, required: ['capabilities', 'input', 'output', 'budget', 'environment', 'questions'],
};
export function parseExtraction(response: unknown): ExtractedIntent {
  const data = response as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (data.status !== 'completed') throw new Error('AI 응답이 완료되지 않았습니다. 조건을 직접 입력하거나 다시 시도하세요.');
  const texts = (data.output ?? []).filter(o => o.type === 'message').flatMap(o => o.content ?? []).filter(c => c.type === 'output_text').map(c => c.text ?? '');
  if (texts.length !== 1) throw new Error('AI가 요구조건을 정리하지 못했습니다. 조건을 직접 선택하세요.');
  try { return extractedIntentSchema.parse(JSON.parse(texts[0])); }
  catch { throw new Error('AI의 요구조건 형식이 올바르지 않습니다. 조건을 직접 선택하세요.'); }
}
