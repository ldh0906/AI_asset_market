import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { modelConfigured, openAIProvider } from '../src/server/model-provider';
import { extractIntent } from '../src/server/ai';
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('never calls an AI API when explicitly disabled, even if inherited keys exist', async () => {
  vi.stubEnv('AI_ENABLED', 'false'); vi.stubEnv('OPENAI_API_KEY', 'test-only-not-a-key'); vi.stubEnv('OPENAI_MODEL', 'test-model');
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect(modelConfigured()).toBe(false); expect(() => openAIProvider()).toThrow();
  await expect(extractIntent('코드 점검 보고서')).rejects.toThrow('AI API를 사용하지 않는');
  expect(fetch).not.toHaveBeenCalled();
});
