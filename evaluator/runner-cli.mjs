import { readFile as readMarketFile } from 'node:fs/promises';
import { createHash as createMarketHash } from 'node:crypto';

// Appended to the exact versioned engine for a self-contained buyer download.
async function marketMain() {
  const args = process.argv.slice(2), options = {};
  if (args.includes('--help')) { process.stdout.write('node market-tools-1.0.0.mjs --asset purchased.json --sha256 0xFILE_HASH --input input.txt\nRuns only the published market-tools/1.0.0 tools. No network or model calls.\n'); return; }
  for (let n = 0; n < args.length; n += 2) {
    if (!['--asset', '--sha256', '--input'].includes(args[n]) || !args[n + 1] || options[args[n]]) throw new Error('Use --asset FILE --sha256 HASH --input FILE.');
    options[args[n]] = args[n + 1];
  }
  if (!options['--asset'] || !options['--input'] || !/^0x[a-fA-F0-9]{64}$/.test(options['--sha256'] ?? '')) throw new Error('An asset, input file and purchased SHA-256 hash are required.');
  const assetBytes = await readMarketFile(options['--asset']);
  if (assetBytes.length > 1048576) throw new Error('Asset exceeds 1MB.');
  const digest = '0x' + createMarketHash('sha256').update(assetBytes).digest('hex');
  if (digest.toLowerCase() !== options['--sha256'].toLowerCase()) throw new Error('Purchased file SHA-256 does not match.');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(assetBytes)), definition = describe(manifest);
  const inputBytes = await readMarketFile(options['--input']);
  if (inputBytes.length > 400000) throw new Error('Input is too large.');
  const inputText = new TextDecoder('utf-8', { fatal: true }).decode(inputBytes);
  if (inputText.length > 100000) throw new Error('Input exceeds 100,000 characters.');
  const output = run([manifest], definition.input === 'json' ? JSON.parse(inputText) : inputText);
  process.stdout.write((typeof output === 'string' ? output : JSON.stringify(output, null, 2)) + '\n');
}
marketMain().catch(error => { process.stderr.write(`Execution failed: ${error.message}\n`); process.exitCode = 1; });
