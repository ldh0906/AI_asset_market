import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { appOrigin } from '../src/server/config';
import { assertOrigin } from '../src/server/http';

beforeEach(() => {
  vi.stubEnv('MARKET_MODE', 'supabase');
  vi.stubEnv('APP_ORIGIN', '');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'market.vercel.app');
  vi.stubEnv('VERCEL_URL', 'market-build.vercel.app');
});
afterEach(() => vi.unstubAllEnvs());

it('accepts the production origin but rejects an unrelated site even with a forged request URL', () => {
  expect(() => assertOrigin(new Request('https://market.vercel.app/api/market/logout', { headers: { origin: 'https://market.vercel.app' } }))).not.toThrow();
  expect(() => assertOrigin(new Request('https://attacker.example/api/market/logout', { headers: { origin: 'https://attacker.example' } }))).toThrow('허용되지 않은 요청 출처');
});
it('isolates preview requests from the production domain', () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  expect(appOrigin()).toBe('https://market-build.vercel.app');
  expect(() => assertOrigin(new Request('https://market-build.vercel.app/api/market/logout', { headers: { origin: 'https://market.vercel.app' } }))).toThrow();
});
it('supports an explicit custom origin and fails closed when Vercel has no domain', () => {
  vi.stubEnv('APP_ORIGIN', 'https://market.example/');
  expect(appOrigin()).toBe('https://market.example');
  vi.stubEnv('APP_ORIGIN', ''); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
  expect(() => appOrigin()).toThrow('배포 주소 설정');
});
