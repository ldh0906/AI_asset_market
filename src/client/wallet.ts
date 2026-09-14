import { createWalletClient, createPublicClient, custom, defineChain, type EIP1193Provider, type Abi, type Hex } from 'viem';
import { api } from './api';
import type { Terms } from '../domain/model';
import { contractTerms, termsTypedData } from '../domain/typed-data';
import marketArtifact from '../generated/AssetMarket.json';
import tokenArtifact from '../generated/TestCredits.json';
declare global { interface Window { ethereum?: EIP1193Provider } }
async function wallet() {
  if (!window.ethereum) throw new Error('이 브라우저에 지갑이 없습니다. 상단의 지갑 만들기 안내에서 설치한 뒤 이 페이지를 새로고침하세요.');
  const config = await api<{ chainId: number; market: Hex; token: Hex }>('chain');
  const chain = defineChain({ id: config.chainId, name: 'Market testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } });
  const transport = custom(window.ethereum);
  const client = createWalletClient({ transport, chain });
  const [address] = await client.requestAddresses();
  await client.switchChain({ id: config.chainId });
  return { ...config, address, client, publicClient: createPublicClient({ transport, chain }) };
}
export async function connectWallet() {
  const w = await wallet();
  const challenge = await api('wallet/challenge', { address: w.address });
  const signature = await w.client.signMessage({ account: w.address, message: challenge.message });
  return api('wallet/verify', { id: challenge.id, signature });
}
export async function signSale(terms: Terms) {
  const w = await wallet();
  if (w.address.toLowerCase() !== terms.seller.toLowerCase()) throw new Error('등록된 판매자 지갑으로 전환하세요.');
  return w.client.signTypedData({ account: w.address, ...termsTypedData(terms, w.chainId, w.market) });
}
export async function receiveTestCredits() {
  const w = await wallet();
  const hash = await w.client.writeContract({ account: w.address, address: w.token, abi: tokenArtifact.abi as Abi, functionName: 'faucet' });
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('테스트 자산 발급에 실패했습니다.');
}
export async function buyWithWallet(versionIds: string[], quoteHash: string) {
  const q = await api('quote', { versionIds }), w = await wallet();
  if (q.quoteHash !== quoteHash) throw new Error('판매 조건이 변경되었습니다. 구매 조건을 다시 확인하세요.');
  const linked = await api('wallet', {});
  if (linked.wallet.address.toLowerCase() !== w.address.toLowerCase()) throw new Error('이 계정에 연결된 구매 지갑으로 전환하세요.');
  const balance = await w.publicClient.readContract({ address: w.token, abi: tokenArtifact.abi as Abi, functionName: 'balanceOf', args: [w.address] }) as bigint;
  if (balance < BigInt(q.total)) throw new Error('TEST 잔액이 부족합니다. 상단의 테스트 자산 받기를 이용하세요.');
  const allowance = await w.publicClient.readContract({ address: w.token, abi: tokenArtifact.abi as Abi, functionName: 'allowance', args: [w.address, w.market] }) as bigint;
  if (allowance < BigInt(q.total)) {
    const approval = await w.client.writeContract({ account: w.address, address: w.token, abi: tokenArtifact.abi as Abi, functionName: 'approve', args: [w.market, BigInt(q.total)] });
    const receipt = await w.publicClient.waitForTransactionReceipt({ hash: approval });
    if (receipt.status !== 'success') throw new Error('테스트 토큰 사용 승인이 실패했습니다.');
  }
  const txHash = await w.client.writeContract({ account: w.address, address: w.market, abi: marketArtifact.abi as Abi, functionName: 'purchase',
    args: [q.terms.map(contractTerms), q.signatures, q.discounts.map(BigInt), q.orderId, BigInt(q.deadline), BigInt(q.total)] });
  const receipt = await w.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error('구매 거래가 실패했습니다.');
  try { return await api('receipt', { txHash }); }
  catch { throw new Error(`거래는 성공했지만 내역 동기화에 실패했습니다. 보관함에서 이 거래를 다시 동기화하세요: ${txHash}`); }
}
