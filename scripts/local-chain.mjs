import { network } from 'hardhat';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, custom, defineChain } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
const connection = await network.create('localMarket');
const provider = connection.provider;
const chain = defineChain({ id: 31337, name: 'Local Market', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } });
// Public, disposable Hardhat development accounts. Never fund on a public chain.
const mnemonic = 'test test test test test test test test test test test junk';
const accounts = [0, 1, 2, 3, 4].map(addressIndex => mnemonicToAccount(mnemonic, { addressIndex }));
const client = createPublicClient({ chain, transport: custom(provider) });
const wallet = createWalletClient({ account: accounts[0], chain, transport: custom(provider) });
async function deploy(name, args = []) {
  const artifact = JSON.parse(await readFile(`src/generated/${name}.json`, 'utf8'));
  const tx = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  return (await client.waitForTransactionReceipt({ hash: tx })).contractAddress;
}
const token = await deploy('TestCredits');
const market = await deploy('AssetMarket', [token, accounts[4].address, accounts[0].address]);
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.headers.origin) { res.writeHead(403); res.end(); return; }
  try {
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 1024 * 1024) throw new Error('Request too large'); }
    const body = JSON.parse(text);
    const run = async item => {
      try { return { jsonrpc: '2.0', id: item.id, result: await provider.request({ method: item.method, params: item.params }) }; }
      catch (error) { return { jsonrpc: '2.0', id: item.id, error: { code: error.code ?? -32603, message: error.message, data: error.data } }; }
    };
    const result = Array.isArray(body) ? await Promise.all(body.map(run)) : await run(body);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  } catch { res.writeHead(400); res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8545, '127.0.0.1', resolve); });
await mkdir('.data', { recursive: true });
await writeFile('.data/chain.json', JSON.stringify({ chainId: 31337, rpc: 'http://127.0.0.1:8545', market, token, accounts: accounts.map(a => a.address), startedAt: new Date().toISOString() }));
process.stdout.write('Local test chain ready on 127.0.0.1:8545. Contracts deployed.\n');
async function stop() { server.close(); await connection.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
