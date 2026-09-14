import 'server-only';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, defineChain, http, decodeEventLog, type Abi, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import marketArtifact from '../generated/AssetMarket.json';
import tokenArtifact from '../generated/TestCredits.json';
import { isLocal, required } from './config';
import { all, get, put } from './database';
import { localUsers } from './auth';
import type { Purchase, Version, WalletBinding, Terms } from '../domain/model';
import { hashText } from '../domain/hash';
import { contractTerms, termsTypedData } from '../domain/typed-data';
import { quote } from '../domain/pricing';

export const marketAbi = marketArtifact.abi as Abi;
export const tokenAbi = tokenArtifact.abi as Abi;
export async function chainConfig() {
  const config = isLocal() ? JSON.parse(await readFile('.data/chain.json', 'utf8')) : {
    chainId: Number(required('CHAIN_ID')), rpc: required('CHAIN_RPC_URL'), market: required('MARKET_ADDRESS'), token: required('PAYMENT_TOKEN_ADDRESS'),
  };
  if (isLocal() && (config.chainId !== 31337 || new URL(config.rpc).hostname !== '127.0.0.1')) throw new Error('로컬 체인 설정이 올바르지 않습니다.');
  const chain = defineChain({ id: config.chainId, name: isLocal() ? '로컬 테스트 체인' : '테스트넷', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [config.rpc] } } });
  return { chain, rpc: config.rpc as string, market: config.market as Hex, token: config.token as Hex };
}
export async function chainClient() {
  const c = await chainConfig();
  const client = createPublicClient({ chain: c.chain, transport: http(c.rpc), pollingInterval: 300 });
  if (await client.getChainId() !== c.chain.id) throw new Error('설정한 네트워크와 RPC가 일치하지 않습니다.');
  return { ...c, client };
}
export function localAccount(index: number) {
  if (!isLocal()) throw new Error('개발용 지갑은 로컬 모드에서만 사용합니다.');
  return mnemonicToAccount('test test test test test test test test test test test junk', { addressIndex: index });
}
export async function localWallet(userId: string) {
  const index = Object.values(localUsers).findIndex(u => u.id === userId) + 1;
  if (!index) throw new Error('알 수 없는 개발용 계정입니다.');
  const c = await chainConfig();
  return createWalletClient({ chain: c.chain, transport: http(c.rpc), account: localAccount(index) });
}
export async function binding(userId: string) {
  const found = (await all<WalletBinding>('wallets')).find(b => b.ownerId === userId);
  if (found) return found;
  if (!isLocal()) throw new Error('먼저 본인 지갑을 연결하고 서명으로 확인하세요.');
  const wallet = await localWallet(userId);
  return put('wallets', { id: crypto.randomUUID(), ownerId: userId, address: wallet.account.address } as WalletBinding);
}
export async function attest(version: Version, reportHash: Hex, active: boolean) {
  const c = await chainClient();
  const seller = await binding(version.ownerId);
  const account = isLocal() ? localAccount(0) : privateKeyToAccount(required('VALIDATOR_PRIVATE_KEY') as Hex);
  const wallet = createWalletClient({ chain: c.chain, transport: http(c.rpc), account });
  const hash = await wallet.writeContract({ address: c.market, abi: marketAbi, functionName: 'attest', args: [hashText(version.id), version.fileHash, reportHash, seller.address, active] });
  const receipt = await c.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('시험 기록의 체인 등록에 실패했습니다.');
  return hash;
}
export async function currentAttestation(t: Terms) {
  const c = await chainClient();
  const a = await c.client.readContract({ address: c.market, abi: marketAbi, functionName: 'attestations', args: [t.versionKey] }) as [Hex, Hex, Hex, boolean];
  const cancelled = await c.client.readContract({ address: c.market, abi: marketAbi, functionName: 'cancelledNonces', args: [t.seller, BigInt(t.nonce)] });
  return a[3] && a[0] === t.fileHash && a[1] === t.reportHash && a[2].toLowerCase() === t.seller.toLowerCase() && !cancelled;
}
export async function canDownload(userId: string, version: Version) {
  if (userId === version.ownerId) return true;
  const b = await binding(userId), c = await chainClient();
  return Boolean(await c.client.readContract({ address: c.market, abi: marketAbi, functionName: 'entitlements', args: [b.address, hashText(version.id)] }));
}
export async function verifyTerms(t: Terms, signature: Hex) {
  const c = await chainClient();
  return c.client.verifyTypedData({ address: t.seller, signature, ...termsTypedData(t, c.chain.id, c.market) });
}
export async function localBuy(userId: string, terms: Terms[], signatures: Hex[], discounts: string[], orderId: Hex, deadline: number) {
  if (!isLocal()) throw new Error('브라우저 지갑에서 구매를 승인하세요.');
  const c = await chainClient(), wallet = await localWallet(userId), q = quote(terms, discounts);
  const balance = await c.client.readContract({ address: c.token, abi: tokenAbi, functionName: 'balanceOf', args: [wallet.account.address] }) as bigint;
  if (balance < BigInt(q.total)) await c.client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: c.token, abi: tokenAbi, functionName: 'faucet' }) });
  await c.client.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: c.token, abi: tokenAbi, functionName: 'approve', args: [c.market, BigInt(q.total)] }) });
  const hash = await wallet.writeContract({ address: c.market, abi: marketAbi, functionName: 'purchase', args: [terms.map(contractTerms), signatures, discounts.map(BigInt), orderId, BigInt(deadline), BigInt(q.total)] });
  await c.client.waitForTransactionReceipt({ hash });
  return recordPurchase(userId, hash);
}
export async function recordPurchase(userId: string, txHash: Hex): Promise<Purchase> {
  const c = await chainClient(), b = await binding(userId);
  const receipt = await c.client.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== c.market.toLowerCase()) throw new Error('성공한 마켓 거래가 아닙니다.');
  const logs = receipt.logs.filter(l => l.address.toLowerCase() === c.market.toLowerCase()).flatMap(log => {
    try { return [decodeEventLog({ abi: marketAbi, data: log.data, topics: log.topics })]; } catch { return []; }
  });
  const order = logs.find(l => l.eventName === 'OrderPurchased')?.args as { buyer: Hex; orderId: Hex; total: bigint } | undefined;
  if (!order || order.buyer.toLowerCase() !== b.address.toLowerCase()) throw new Error('본인 지갑의 구매 거래만 등록할 수 있습니다.');
  const prior = (await all<Purchase>('purchases')).find(p => p.txHash.toLowerCase() === txHash.toLowerCase());
  if (prior) { if (prior.ownerId !== userId) throw new Error('다른 계정의 거래입니다.'); return prior; }
  const versions = await all<Version>('versions');
  const items = logs.filter(l => l.eventName === 'ItemPurchased').map(l => l.args as unknown as { versionKey: Hex; buyer: Hex; orderId: Hex; seller: Hex; sellerAmount: bigint; platformAmount: bigint; fileHash: Hex; licenseHash: Hex });
  if (!items.length || items.some(i => i.buyer.toLowerCase() !== b.address.toLowerCase() || i.orderId !== order.orderId)) throw new Error('구매 항목이 일치하지 않습니다.');
  const purchased = items.map(i => versions.find(v => hashText(v.id) === i.versionKey && v.fileHash === i.fileHash && v.licenseHash === i.licenseHash));
  if (purchased.some(v => !v)) throw new Error('거래한 상품 버전을 찾을 수 없습니다.');
  return put('purchases', { id: crypto.randomUUID(), ownerId: userId, buyer: b.address, versionIds: purchased.map(v => v!.id), txHash,
    total: order.total.toString(), settlements: items.map(i => ({ seller: i.seller, amount: i.sellerAmount.toString() })),
    platformFee: items.reduce((sum, i) => sum + i.platformAmount, 0n).toString(), createdAt: new Date().toISOString() });
}
