import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ reports: [] as any[], jobs: new Map<string, any>() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/server/database', () => ({ all: async () => fixture.reports, get: async (_: string, id: string) => fixture.jobs.get(id), put: vi.fn() }));
vi.mock('../src/server/storage', () => ({ storeFile: vi.fn() }));
vi.mock('../src/server/chain', () => ({}));
vi.mock('../src/server/config', () => ({ isLocal: () => true }));
import { marketReports } from '../src/server/market';
it.each(['running', 'failed', 'cancelled', 'missing'])('excludes %s model work from public scores even when a partial report was saved', async status => {
  fixture.reports = [{ id: 'static-report' }, { id: 'model-report', modelEvaluation: { jobId: 'job' }, eligible: true }];
  fixture.jobs.clear(); if (status !== 'missing') fixture.jobs.set('job', { status, reportId: 'model-report' });
  expect(await marketReports()).toEqual([{ id: 'static-report' }]);
});
it('requires completed job to reference exactly the finalized report', async () => {
  fixture.reports = [{ id: 'model-report', modelEvaluation: { jobId: 'job' }, eligible: true }];
  fixture.jobs.set('job', { status: 'completed', reportId: 'different-report' });
  expect(await marketReports()).toEqual([]);
  fixture.jobs.set('job', { status: 'completed', reportId: 'model-report' });
  expect(await marketReports()).toEqual(fixture.reports);
});
