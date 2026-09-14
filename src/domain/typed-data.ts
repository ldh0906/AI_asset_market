import type { Terms } from './model';
export const termsTypes = { Terms: [
  { name: 'seller', type: 'address' }, { name: 'versionKey', type: 'bytes32' },
  { name: 'fileHash', type: 'bytes32' }, { name: 'reportHash', type: 'bytes32' }, { name: 'licenseHash', type: 'bytes32' },
  { name: 'sellerAmount', type: 'uint256' }, { name: 'platformFee', type: 'uint256' }, { name: 'maxDiscount', type: 'uint256' },
  { name: 'validUntil', type: 'uint256' }, { name: 'nonce', type: 'uint256' },
] } as const;
export function contractTerms(t: Terms) {
  return { ...t, sellerAmount: BigInt(t.sellerAmount), platformFee: BigInt(t.platformFee), maxDiscount: BigInt(t.maxDiscount), validUntil: BigInt(t.validUntil), nonce: BigInt(t.nonce) };
}
export function termsTypedData(terms: Terms, chainId: number, verifyingContract: `0x${string}`) {
  return { domain: { name: 'AI Asset Market', version: '1', chainId, verifyingContract }, types: termsTypes, primaryType: 'Terms' as const, message: contractTerms(terms) };
}
