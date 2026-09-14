import solc from 'solc';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const sources = Object.fromEntries(['AssetMarket', 'TestCredits'].map(name => [`${name}.sol`, { content: readFileSync(`contracts/${name}.sol`, 'utf8') }]));
const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
  evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: name => {
  const target = path.resolve('node_modules', name);
  if (!target.startsWith(path.resolve('node_modules') + path.sep)) return { error: 'Invalid import' };
  try { return { contents: readFileSync(target, 'utf8') }; } catch { return { error: `Import unavailable: ${name}` }; }
} }));
const errors = (output.errors ?? []).filter(e => e.severity === 'error');
if (errors.length) { process.stderr.write(errors.map(e => e.formattedMessage).join('\n')); process.exit(1); }
mkdirSync('src/generated', { recursive: true });
for (const name of ['AssetMarket', 'TestCredits']) {
  const compiled = output.contracts[`${name}.sol`][name];
  writeFileSync(`src/generated/${name}.json`, JSON.stringify({ abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}`, compiler: solc.version(), evmVersion: input.settings.evmVersion }, null, 2));
}
process.stdout.write('Compiled AssetMarket and TestCredits\n');
