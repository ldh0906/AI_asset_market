import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ rows: new Map<string, any>(), files: new Map<string, Uint8Array>(), configured: true, respond: vi.fn(), attest: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/server/database', () => ({
  all: async (table: string) => [...h.rows].filter(([key]) => key.startsWith(table + '/')).map(([, value]) => structuredClone(value)),
  get: async (table: string, id: string) => structuredClone(h.rows.get(table + '/' + id)),
  put: async (table: string, value: any) => { h.rows.set(table + '/' + value.id, structuredClone(value)); return value; },
  replaceRevision: async (table: string, value: any, ownerId: string, revision: number) => {
    const key = table + '/' + value.id, current = h.rows.get(key);
    if (!current || current.ownerId !== ownerId || current.revision !== revision) return false;
    h.rows.set(key, structuredClone(value)); return true;
  },
}));
vi.mock('../src/server/storage', () => ({ loadFile: async (path: string) => h.files.get(path) }));
vi.mock('../src/server/config', () => ({ required: () => 'fixed-model-test' }));
vi.mock('../src/server/model-provider', () => ({ modelConfigured: () => h.configured, openAIProvider: () => ({ respond: h.respond }) }));
vi.mock('../src/server/chain', () => ({ attest: h.attest }));
import { createJob, stepJob, cancelJob, listJobs } from '../src/server/evaluation-jobs';
import { hashText } from '../src/domain/hash';
import { run } from '../evaluator/engine.mjs';
import { ENVIRONMENT } from '../src/domain/model';
const owner = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002', id = '20000000-0000-4000-8000-000000000001';
const text = '---\nname: code-review\ndescription: Inspect code patterns.\nallowed-tools: code.review\n---\nRun code.review and return the resulting JSON.';
function reply(input: any[]) {
  const task = JSON.parse(input[0].content);
  const result = JSON.stringify(run([{ schemaVersion: 1, steps: [{ tool: 'code.review' }] }], task.input));
  return { status: 'completed', model: 'fixed-model-test', usage: { input_tokens: 100, output_tokens: 20 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ result }) }] }] };
}
beforeEach(() => {
  h.rows.clear(); h.files.clear(); h.respond.mockReset(); h.attest.mockReset(); h.configured = true;
  h.respond.mockImplementation(async input => reply(input)); h.attest.mockResolvedValue(hashText('isolated-test-transaction'));
  h.files.set('skill-file', new TextEncoder().encode(text));
  h.rows.set('assets/' + id, { id, ownerId: owner, title: 'Test skill', kind: 'skill' });
  h.rows.set('versions/' + id, { id, ownerId: owner, assetId: id, fileName: 'SKILL.md', contentFormat: 'agent-skill', fileHash: hashText(text), storagePath: 'skill-file', version: '1.0.0', input: 'code', output: 'json', capabilities: ['code-review'], environment: ENVIRONMENT, license: 'same', licenseHash: hashText('same'), limitations: [], state: 'draft', createdAt: '' });
});
it('keeps jobs private, refuses missing AI settings and rejects concurrent active jobs', async () => {
  h.configured = false; await expect(createJob(owner, [id])).rejects.toThrow('AI 모델 연결');
  expect(h.respond).not.toHaveBeenCalled(); h.configured = true;
  const job = await createJob(owner, [id]);
  expect(job).not.toHaveProperty('versions'); expect(job).not.toHaveProperty('trials');
  expect(await listJobs(other)).toEqual([]);
  await expect(stepJob(other, job.id)).rejects.toThrow('본인의');
  await expect(createJob(owner, [id])).rejects.toThrow('진행 중');
});
it('resumes from saved trials without repeating a paid request and publishes only after every comparison', async () => {
  let job = await createJob(owner, [id]);
  expect(job.totalTrials).toBe(12);
  job = await stepJob(owner, job.id); expect(job.completedTrials).toBe(1); expect(job.status).toBe('pending');
  expect(h.attest).not.toHaveBeenCalled();
  for (let n = 1; n < 12; n++) job = await stepJob(owner, job.id);
  expect(job.status).toBe('completed'); expect(h.respond).toHaveBeenCalledTimes(12); expect(h.attest).toHaveBeenCalledTimes(1);
  const report = h.rows.get('reports/' + job.reportId);
  expect(report.eligible).toBe(true); expect(report.modelEvaluation.comparisons.map((c: any) => c.passed)).toEqual([6, 6]);
  expect(report.inferenceCost).toBeNull(); expect(h.rows.get('versions/' + id).state).toBe('review');
  await stepJob(owner, job.id); expect(h.respond).toHaveBeenCalledTimes(12);
});
it('allows only one worker to claim a trial', async () => {
  const job = await createJob(owner, [id]); let release!: (value: unknown) => void;
  let captured: any[] = []; h.respond.mockImplementation(input => { captured = input; return new Promise(resolve => { release = resolve; }); });
  const first = stepJob(owner, job.id);
  await vi.waitFor(() => expect(h.respond).toHaveBeenCalledTimes(1));
  expect((await stepJob(owner, job.id)).status).toBe('running');
  release(reply(captured)); expect((await first).completedTrials).toBe(1);
  expect(h.respond).toHaveBeenCalledTimes(1);
});
it('fails closed on changed file bytes and never retries uncertain expired calls', async () => {
  const job = await createJob(owner, [id]); h.files.set('skill-file', new TextEncoder().encode('Changed contents'));
  expect((await stepJob(owner, job.id)).status).toBe('failed'); expect(h.respond).not.toHaveBeenCalled(); expect(h.attest).not.toHaveBeenCalled();
  const row = h.rows.get('evaluation_jobs/' + job.id); h.rows.set('evaluation_jobs/' + job.id, { ...row, status: 'running', leaseUntil: '2000-01-01T00:00:00.000Z' });
  const failed = await stepJob(owner, job.id); expect(failed.status).toBe('failed'); expect(failed.error).toContain('비용은 확인되지');
  await stepJob(owner, job.id); expect(h.respond).not.toHaveBeenCalled();
});
it('cancels pending work and requires stopping an active sale before reevaluation', async () => {
  const job = await createJob(owner, [id]); expect((await cancelJob(owner, job.id)).status).toBe('cancelled');
  expect((await stepJob(owner, job.id)).status).toBe('cancelled'); expect(h.respond).not.toHaveBeenCalled();
  h.rows.get('versions/' + id).state = 'listed';
  await expect(createJob(owner, [id])).rejects.toThrow('판매를 중지');
});
