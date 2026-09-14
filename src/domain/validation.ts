import { z } from 'zod';
import { capabilities, ENVIRONMENT } from './model';
export const formatSchema = z.enum(['code', 'csv', 'json', 'markdown', 'text']);
export const amountSchema = z.string().regex(/^(0|[1-9]\d{0,12})$/, '금액은 0 이상의 정수여야 합니다.');
export const newAssetSchema = z.object({
  assetId: z.uuid().optional(), title: z.string().trim().min(2).max(80),
  summary: z.string().trim().min(10).max(500), kind: z.enum(['skill', 'document']),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, '버전은 1.0.0 형식입니다.'),
  license: z.string().trim().min(10).max(4000),
  limitations: z.array(z.string().trim().min(1).max(300)).max(10),
  capabilities: z.array(z.enum(capabilities)).min(1).max(4).optional(),
  input: formatSchema.optional(), output: formatSchema.optional(),
});
export const intentSchema = z.object({
  goal: z.string().trim().min(3).max(1000), capabilities: z.array(z.enum(capabilities)).min(1).max(4),
  input: formatSchema, output: formatSchema, budget: amountSchema,
  environment: z.literal(ENVIRONMENT),
});
export const skillSchema = z.object({
  schemaVersion: z.literal(1),
  steps: z.array(z.object({ tool: z.enum(['code.review', 'csv.summarize', 'report.markdown']) }).strict()).min(1).max(3),
}).strict();
export const termsInputSchema = z.object({ sellerAmount: amountSchema, platformFee: amountSchema, maxDiscount: amountSchema,
  validDays: z.number().int().min(1).max(90) });
