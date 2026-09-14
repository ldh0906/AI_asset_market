import type { Terms } from './model';
export function quote(terms: Terms[], discounts: string[]) {
  if (!terms.length || terms.length > 8 || discounts.length !== terms.length) throw new Error('구매 구성이 올바르지 않습니다.');
  let sellerTotal = 0n, fee = 0n, discount = 0n;
  const keys = new Set<string>();
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    if (keys.has(t.versionKey)) throw new Error('같은 버전은 한 번만 구매할 수 있습니다.');
    keys.add(t.versionKey);
    const seller = BigInt(t.sellerAmount), platform = BigInt(t.platformFee), max = BigInt(t.maxDiscount), d = BigInt(discounts[i]);
    if (seller <= 0n || platform < 0n || max < 0n || max > platform || d < 0n || d > max) throw new Error('판매자 승인 할인 한도를 벗어났습니다.');
    sellerTotal += seller; fee += platform - d; discount += d;
  }
  return { total: (sellerTotal + fee).toString(), sellerTotal: sellerTotal.toString(), platformFee: fee.toString(), discount: discount.toString() };
}
