export type DemoLedger = {
  buyer: number;
  sellerOne: number;
  sellerTwo: number;
  platform: number;
};

export type TransactionDemoState = {
  ledger: DemoLedger;
  owned: boolean;
  usedOrders: string[];
  reviewOnSale: boolean;
  reportOnSale: boolean;
  combinationTestValid: boolean;
};

export type TradeResult = {
  state: TransactionDemoState;
  status: 'success' | 'rejected';
  reason: 'OrderPurchased' | 'InvalidOrder' | 'InvalidDiscount' | 'AlreadyOwned' | 'InvalidAttestation' | 'InsufficientBalance';
};

export const demoTerms = {
  sellerAmount: 90,
  platformFee: 10,
  maxDiscount: 5,
} as const;

export const originalDemoFile = '{"schemaVersion":1,"steps":[{"tool":"code.review"}]}';
export const changedDemoFile = '{"schemaVersion":1,"steps":[{"tool":"unknown.execute"}]}';

export function initialTransactionDemoState(): TransactionDemoState {
  return {
    ledger: { buyer: 500, sellerOne: 0, sellerTwo: 0, platform: 0 },
    owned: false,
    usedOrders: [],
    reviewOnSale: true,
    reportOnSale: true,
    combinationTestValid: true,
  };
}

export function combinationAvailable(state: TransactionDemoState) {
  return state.reviewOnSale && state.reportOnSale && state.combinationTestValid;
}

export function purchaseDemoSet(state: TransactionDemoState, orderId: string, discounts: readonly [number, number]): TradeResult {
  const reject = (reason: TradeResult['reason']): TradeResult => ({ state, status: 'rejected', reason });
  if (!orderId || state.usedOrders.includes(orderId)) return reject('InvalidOrder');
  if (discounts.some(discount => !Number.isInteger(discount) || discount < 0 || discount > demoTerms.maxDiscount)) return reject('InvalidDiscount');
  if (!combinationAvailable(state)) return reject('InvalidAttestation');
  if (state.owned) return reject('AlreadyOwned');
  const sellerTotal = demoTerms.sellerAmount * 2;
  const platformTotal = demoTerms.platformFee * 2 - discounts[0] - discounts[1];
  const total = sellerTotal + platformTotal;
  if (state.ledger.buyer < total) return reject('InsufficientBalance');
  return {
    status: 'success', reason: 'OrderPurchased',
    state: {
      ...state,
      ledger: {
        buyer: state.ledger.buyer - total,
        sellerOne: state.ledger.sellerOne + demoTerms.sellerAmount,
        sellerTwo: state.ledger.sellerTwo + demoTerms.sellerAmount,
        platform: state.ledger.platform + platformTotal,
      },
      owned: true,
      usedOrders: [...state.usedOrders, orderId],
    },
  };
}

export function stopDemoReviewSale(state: TransactionDemoState): TransactionDemoState {
  return { ...state, reviewOnSale: false };
}

export async function demoFileHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkDemoDownload(state: TransactionDemoState, suppliedFile: string) {
  const [expectedHash, receivedHash] = await Promise.all([demoFileHash(originalDemoFile), demoFileHash(suppliedFile)]);
  return { expectedHash, receivedHash, allowed: state.owned && expectedHash === receivedHash };
}
