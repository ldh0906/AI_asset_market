import { mkdir, access, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
await mkdir('.data', { recursive: true });
try { await access('.data/session-secret'); } catch { await writeFile('.data/session-secret', randomBytes(32).toString('hex'), { flag: 'wx' }); }
try { await access('.env.local'); process.stdout.write('Existing .env.local preserved.\n'); }
catch { await writeFile('.env.local', 'MARKET_MODE=local\nAPP_ORIGIN=http://127.0.0.1:3100\n', { flag: 'wx' }); }
process.stdout.write('Local settings ready. Start chain:local and dev in separate terminals.\n');
