export type AssetKind = 'skill' | 'document';
export const capabilities = ['code-review', 'data-summary', 'report', 'document-reference'] as const;
export type Capability = typeof capabilities[number];
export type Format = 'code' | 'csv' | 'json' | 'markdown' | 'text';
export type AssetState = 'draft' | 'review' | 'listed' | 'suspended';
export interface Asset {
  id: string; ownerId: string; title: string; summary: string; kind: AssetKind;
  createdAt: string;
  purpose?: string; supportedTools?: string[]; coverPath?: string;
  contents?: string[]; prerequisites?: string; installation?: string;
  usageTerms?: string; sellerName?: string; freePackage?: boolean;
}
export interface Version {
  id: string; assetId: string; ownerId: string; version: string; fileName: string;
  fileHash: `0x${string}`; storagePath: string; capabilities: Capability[];
  input: Format; output: Format; environment: string; license: string;
  licenseHash: `0x${string}`; limitations: string[]; state: AssetState;
  reportId?: string; createdAt: string; statusReason?: string;
  contentFormat?: 'workflow' | 'agent-skill' | 'document';
  skillName?: string; allowedTools?: string[];
  freePackage?: boolean; packageKey?: string;
}
export interface TestCase { name: string; passed: boolean; detail: string }
export interface Report {
  id: string; versionIds: string[]; fileHashes: string[]; kind: 'single' | 'combination';
  environment: string; evaluator: string; rulesVersion: string; createdAt: string;
  accuracy: { task: string; cases: TestCase[]; passed: number; total: number };
  security: { findings: string[]; scanned: string[]; untested: string[]; knownMisses: string[]; benchmark?: SecurityBenchmark };
  limitations: string[]; durationMs: number; inferenceCost: number | null;
  requiresModelEvaluation?: boolean;
  modelEvaluation?: ModelEvaluation;
  eligible: boolean; reportHash: `0x${string}`; attestationTx?: `0x${string}`; revokedAt?: string;
}
export interface Terms {
  seller: `0x${string}`; versionKey: `0x${string}`; fileHash: `0x${string}`;
  reportHash: `0x${string}`; licenseHash: `0x${string}`;
  sellerAmount: string; platformFee: string; maxDiscount: string;
  validUntil: string; nonce: string;
}
export interface Offer {
  id: string; versionId: string; ownerId: string; terms: Terms;
  signature: `0x${string}`; chainId: number; contract: `0x${string}`;
  createdAt: string; cancelledAt?: string;
}
export interface Purchase {
  id: string; ownerId: string; buyer: `0x${string}`; versionIds: string[];
  txHash: `0x${string}`; total: string; settlements: { seller: string; amount: string }[];
  platformFee: string; createdAt: string;
}
export interface WalletBinding { id: string; ownerId: string; address: `0x${string}` }
export interface Challenge { id: string; ownerId: string; message: string; expiresAt: string; used: boolean }
export interface CatalogItem { asset: Asset; version: Version; report?: Report; offer?: Offer }
export type StoryNode = { type: string; text?: string; attrs?: Record<string, string | number>; marks?: { type: string; attrs?: Record<string, string> }[]; content?: StoryNode[] };
export interface ProductStory {
  id: string; ownerId: string; assetId: string; draft: StoryNode; published?: StoryNode;
  draftMeta: ProductStoryMeta; publishedMeta?: ProductStoryMeta; updatedAt: string; publishedAt?: string;
}
export interface ProductStoryMeta {
  title: string; summary: string; purpose: string; supportedTools: string[]; coverMediaId?: string;
  contents: string[]; prerequisites: string; installation: string; usageTerms: string;
}
export interface ProductMedia { id: string; ownerId: string; assetId: string; path: string; mime: string; size: number; createdAt: string }
export interface FreeClaim { id: string; ownerId: string; versionId: string; createdAt: string }
export interface Intent {
  goal: string; capabilities: Capability[]; input: Format; output: Format;
  budget: string; environment: string;
}
export interface Recommendation {
  status: 'matched' | 'no-match' | 'needs-information'; intent: Intent;
  source: 'explicit-constraints' | 'openai'; items: CatalogItem[]; reasons: string[];
  total: string; discount: string; report?: Report; alternatives: { versionIds: string[]; total: string }[];
}
export const ENVIRONMENT = 'market-tools/1.0.0';
export const capabilityLabels: Record<Capability, string> = {
  'code-review': '코드 점검', 'data-summary': '데이터 집계', report: '보고서 작성', 'document-reference': '문서 참조',
};
export interface Usage { inputTokens: number; cachedInputTokens: number; outputTokens: number }
export interface SecurityBenchmark {
  version: string; truePositive: number; falseNegative: number; falsePositive: number; trueNegative: number;
  detectionRate: number; falsePositiveRate: number; scope: string;
  cases: { name: string; expectedRisk: boolean; detected: boolean }[];
}
export interface Sale { versionId: string; title: string; version: string; txHash: string; createdAt: string; sellerAmount: string; seller: string }
export interface ModelJob {
  id: string; versionIds: string[]; titles: string[]; status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  model: string; completedTrials: number; totalTrials: number; repeats: number; caseNames: string[];
  error?: string; reportId: string | null; createdAt: string; maxModelRequests: number;
}
export interface ModelVariantResult {
  label: string; versionIds: string[]; passed: number; total: number; productPrice: string | null;
  durationMs: { mean: number; min: number; max: number }; usage: Usage; estimatedCostUsd: number | null;
}
export interface ModelEvaluation {
  jobId: string; model: string; suiteVersion: string; repeats: number; trialCount: number;
  comparisons: ModelVariantResult[]; bestSingleIndex: number; caseNames: string[];
  grading: string; priceSource: string | null; estimatedCostUsd: number | null;
}
