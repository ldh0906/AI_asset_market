import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { network } from 'hardhat';
import { createPublicClient, createWalletClient, custom, defineChain, type Abi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import marketArtifact from '../src/generated/AssetMarket.json';
import tokenArtifact from '../src/generated/TestCredits.json';
import { hashText } from '../src/domain/hash';
import { contractTerms, termsTypedData } from '../src/domain/typed-data';
import { quote } from '../src/domain/pricing';
import type { Terms } from '../src/domain/model';
const accounts = Array.from({ length: 6 }, (_, addressIndex) => mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex }));
const chain = defineChain({ id: 31337, name: 'Test', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://localhost'] } } });
const abi = marketArtifact.abi as Abi, tokenAbi = tokenArtifact.abi as Abi;
let connection: Awaited<ReturnType<typeof network.create>>;
let client: ReturnType<typeof createPublicClient>;
let wallets: ReturnType<typeof createWalletClient>[];
let market: Hex, token: Hex;
async function write(index: number, functionName: string, args: unknown[] = [], tokenCall = false) {
  const hash = await wallets[index].writeContract({ account: accounts[index], chain, address: tokenCall ? token : market, abi: tokenCall ? tokenAbi : abi, functionName, args });
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error('reverted');
  return r;
}
const balance = (index: number) => client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [accounts[index].address] }) as Promise<bigint>;
const owns = (t: Terms) => client.readContract({ address: market, abi, functionName: 'entitlements', args: [accounts[3].address, t.versionKey] });
async function term(index = 1, overrides: Partial<Terms> = {}): Promise<Terms> {
  const now = (await client.getBlock()).timestamp;
  const t: Terms = { seller: accounts[index].address, versionKey: hashText(crypto.randomUUID()), fileHash: hashText('file'), reportHash: hashText('report'), licenseHash: hashText('license'),
    sellerAmount: '90', platformFee: '10', maxDiscount: '5', validUntil: String(now + 3600n), nonce: BigInt(hashText(crypto.randomUUID())).toString(), ...overrides };
  await write(0, 'attest', [t.versionKey, t.fileHash, t.reportHash, t.seller, true]);
  return t;
}
const sign = (t: Terms, i = 1, id = 31337, contract = market) => accounts[i].signTypedData(termsTypedData(t, id, contract));
async function buy(terms: Terms[], signatures: Hex[], discounts = terms.map(() => '0'), orderId = hashText(crypto.randomUUID()), deadline?: bigint) {
  const total = quote(terms, discounts).total;
  return write(3, 'purchase', [terms.map(contractTerms), signatures, discounts.map(BigInt), orderId, deadline ?? (await client.getBlock()).timestamp + 600n, BigInt(total)]);
}
beforeEach(async () => {
  connection = await network.create('localMarket');
  const transport = custom(connection.provider);
  client = createPublicClient({ chain, transport });
  wallets = accounts.map(account => createWalletClient({ account, chain, transport }));
  const deploy = async (artifact: { abi: unknown[]; bytecode: string }, args: unknown[] = []) => {
    const hash = await wallets[0].deployContract({ account: accounts[0], chain, abi: artifact.abi as Abi, bytecode: artifact.bytecode as Hex, args });
    return (await client.waitForTransactionReceipt({ hash })).contractAddress!;
  };
  token = await deploy(tokenArtifact);
  market = await deploy(marketArtifact, [token, accounts[4].address, accounts[0].address]);
  await write(3, 'faucet', [], true);
  await write(3, 'approve', [market, 100000n], true);
});
afterEach(async () => { await connection?.close(); });
describe('seller-approved atomic settlement', () => {
  it('issues both version entitlements and splits two sellers while funding discounts only from fees', async () => {
    const a = await term(), b = await term(2); const before = await balance(3);
    await buy([a, b], [await sign(a), await sign(b, 2)], ['5', '5']);
    expect(await owns(a)).toBe(true); expect(await owns(b)).toBe(true);
    expect(await balance(1)).toBe(90n); expect(await balance(2)).toBe(90n); expect(await balance(4)).toBe(10n);
    expect(before - await balance(3)).toBe(190n);
  });
  it('rejects tampered amount, seller, file, report, license, discount allowance, and nonce without partial effects', async () => {
    const original = await term(), signature = await sign(original);
    const changes: Partial<Terms>[] = [{ sellerAmount: '89' }, { platformFee: '9' }, { maxDiscount: '6' }, { nonce: '99' }, { fileHash: hashText('swapped') }, { reportHash: hashText('different') }, { licenseHash: hashText('resale allowed') }, { seller: accounts[5].address }];
    for (const change of changes) await expect(buy([{ ...original, ...change }], [signature])).rejects.toThrow();
    expect(await owns(original)).toBe(false); expect(await balance(3)).toBe(100000n); expect(await balance(1)).toBe(0n);
  });
  it('binds signatures to the network and contract', async () => {
    const t = await term();
    await expect(buy([t], [await sign(t, 1, 1)])).rejects.toThrow();
    await expect(buy([t], [await sign(t, 1, 31337, accounts[5].address)])).rejects.toThrow();
  });
  it('rejects cancelled offers and evaluations revoked after recommendation', async () => {
    const a = await term(), b = await term();
    await write(1, 'cancelOffer', [BigInt(a.nonce)]);
    await expect(buy([a], [await sign(a)])).rejects.toThrow();
    await write(0, 'attest', [b.versionKey, b.fileHash, b.reportHash, b.seller, false]);
    await expect(buy([b], [await sign(b)])).rejects.toThrow();
  });
  it('rolls back the entire basket if the last item fails', async () => {
    const a = await term(), b = await term(2);
    await expect(buy([a, b], [await sign(a), await sign(b, 1)])).rejects.toThrow();
    expect(await owns(a)).toBe(false); expect(await owns(b)).toBe(false); expect(await balance(1)).toBe(0n);
  });
  it('rejects expired terms, expired orders, repeated order ids, and repeated ownership', async () => {
    const expired = await term(1, { validUntil: '1' });
    await expect(buy([expired], [await sign(expired)])).rejects.toThrow();
    const a = await term(), b = await term(), id = hashText('order');
    await expect(buy([a], [await sign(a)], ['0'], id, 1n)).rejects.toThrow();
    await buy([a], [await sign(a)], ['0'], id);
    await expect(buy([b], [await sign(b)], ['0'], id)).rejects.toThrow();
    await expect(buy([a], [await sign(a)])).rejects.toThrow();
  });
  it('does not grant an administrator power to alter validators or registered files', async () => {
    const t = await term();
    await expect(write(0, 'grantRole', [hashText('role'), accounts[5].address])).rejects.toThrow();
    await expect(write(5, 'attest', [t.versionKey, t.fileHash, t.reportHash, t.seller, true])).rejects.toThrow();
    await expect(write(0, 'attest', [t.versionKey, hashText('new file'), t.reportHash, t.seller, true])).rejects.toThrow();
  });
  it('enforces discount limits and expected total inside the contract itself', async () => {
    const t = await term(), sig = await sign(t), deadline = (await client.getBlock()).timestamp + 600n;
    await expect(write(3, 'purchase', [[contractTerms(t)], [sig], [6n], hashText('excess'), deadline, 94n])).rejects.toThrow();
    await expect(write(3, 'purchase', [[contractTerms(t)], [sig], [0n], hashText('wrong-total'), deadline, 99n])).rejects.toThrow();
    const invalid = await term(1, { maxDiscount: '11' });
    await expect(write(3, 'purchase', [[contractTerms(invalid)], [await sign(invalid)], [0n], hashText('bad-limit'), deadline, 100n])).rejects.toThrow();
    expect(await owns(t)).toBe(false); expect(await balance(1)).toBe(0n);
  });
  it('rolls back entitlements and an earlier successful token transfer if a later transfer fails', async () => {
    const a = await term(1, { sellerAmount: '60000', platformFee: '0', maxDiscount: '0' });
    const b = await term(2, { sellerAmount: '60000', platformFee: '0', maxDiscount: '0' });
    await write(3, 'approve', [market, 120000n], true);
    await expect(buy([a, b], [await sign(a), await sign(b, 2)])).rejects.toThrow();
    expect(await balance(1)).toBe(0n); expect(await balance(2)).toBe(0n); expect(await balance(3)).toBe(100000n);
    expect(await owns(a)).toBe(false); expect(await owns(b)).toBe(false);
  });
  it('conserves balances over a varied domain of payouts, fees, and valid discounts', async () => {
    let seed = 71937;
    const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    for (let n = 0; n < 30; n++) {
      const fee = random(100), max = random(fee + 1), discount = random(max + 1);
      const t = await term(1, { sellerAmount: String(1 + random(500)), platformFee: String(fee), maxDiscount: String(max) });
      const before = await Promise.all([1, 3, 4].map(balance));
      await buy([t], [await sign(t)], [String(discount)]);
      const after = await Promise.all([1, 3, 4].map(balance));
      expect(after.reduce((a, b) => a + b)).toBe(before.reduce((a, b) => a + b));
      expect(after[0] - before[0]).toBe(BigInt(t.sellerAmount));
      expect(after[2]).toBeGreaterThanOrEqual(before[2]);
      expect(await client.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [market] })).toBe(0n);
    }
  });
});
