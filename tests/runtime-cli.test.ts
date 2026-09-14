import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashBytes } from '../src/domain/hash';
let dir: string;
const root = path.resolve('.data');
beforeAll(async () => {
  await mkdir(root, { recursive: true }); dir = await mkdtemp(path.join(root, 'runner-test-'));
  const sources = await Promise.all(['engine.mjs', 'runner-cli.mjs'].map(name => readFile(path.join('evaluator', name), 'utf8')));
  await writeFile(path.join(dir, 'market-tools-1.0.0.mjs'), sources.join('\n'));
});
afterAll(async () => { if (!dir || !path.resolve(dir).startsWith(root + path.sep) || !path.basename(dir).startsWith('runner-test-')) throw new Error('Unexpected cleanup path'); await rm(dir, { recursive: true, force: true }); });
async function execute(manifest: unknown, input: string, override?: string) {
  const bytes = Buffer.from('\ufeff' + JSON.stringify(manifest));
  await writeFile(path.join(dir, 'purchased.json'), bytes); await writeFile(path.join(dir, 'input.txt'), input);
  return execFileSync(process.execPath, ['market-tools-1.0.0.mjs', '--asset', 'purchased.json', '--sha256', override ?? hashBytes(bytes), '--input', 'input.txt'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
it('runs a downloaded self-contained tool without dependencies, preserving purchased BOM hashes', async () => {
  const result = await execute({ schemaVersion: 1, steps: [{ tool: 'code.review' }, { tool: 'report.markdown' }] }, '\neval(input)');
  expect(result).toContain('# 코드 점검 보고서'); expect(result).toContain('dynamic-eval: 2행');
});
it('accepts JSON output as the next workflow’s input', async () => {
  const first = await execute({ schemaVersion: 1, steps: [{ tool: 'csv.summarize' }] }, 'group,amount\na,5\na,10');
  const second = await execute({ schemaVersion: 1, steps: [{ tool: 'report.markdown' }] }, first);
  expect(second).toContain('| a | 15 |');
});
it('rejects changed file hashes and arbitrary execution tools', async () => {
  await expect(execute({ schemaVersion: 1, steps: [{ tool: 'code.review' }] }, 'eval(input)', '0x' + '0'.repeat(64))).rejects.toThrow('SHA-256');
  await expect(execute({ schemaVersion: 1, steps: [{ tool: 'shell' }] }, 'input')).rejects.toThrow('허용되지 않은');
});
