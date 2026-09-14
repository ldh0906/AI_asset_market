import { describe, expect, it } from 'vitest';
import {
  changedDemoFile, checkDemoDownload, combinationAvailable, initialTransactionDemoState,
  originalDemoFile, purchaseDemoSet, stopDemoReviewSale,
} from '../src/domain/transaction-demo';

describe('interactive transaction demo rules', () => {
  it('preserves the total across a range of buyer balances and prevents duplicate settlement', () => {
    for (let buyer = 190; buyer <= 1000; buyer += 17) {
      const initial = initialTransactionDemoState();
      initial.ledger.buyer = buyer;
      initial.ledger.sellerOne = buyer % 23;
      initial.ledger.sellerTwo = buyer % 11;
      initial.ledger.platform = buyer % 7;
      const before = Object.values(initial.ledger).reduce((sum, value) => sum + value, 0);
      const purchase = purchaseDemoSet(initial, `order-${buyer}`, [5, 5]);
      expect(purchase.status).toBe('success');
      expect(Object.values(purchase.state.ledger).reduce((sum, value) => sum + value, 0)).toBe(before);
      expect(purchase.state.ledger.buyer).toBe(buyer - 190);
      expect(purchase.state.owned).toBe(true);
      const duplicate = purchaseDemoSet(purchase.state, `order-${buyer}`, [5, 5]);
      expect(duplicate.reason).toBe('InvalidOrder');
      expect(duplicate.state).toEqual(purchase.state);
    }
  });

  it('rejects an excessive discount before changing balances or rights', () => {
    const initial = initialTransactionDemoState();
    const attempt = purchaseDemoSet(initial, 'over-limit', [6, 5]);
    expect(attempt).toMatchObject({ status: 'rejected', reason: 'InvalidDiscount', state: initial });
    expect(attempt.state.usedOrders).toHaveLength(0);
  });

  it('removes a stopped component from recommendation while preserving earlier rights', () => {
    const purchased = purchaseDemoSet(initialTransactionDemoState(), 'purchase', [5, 5]).state;
    expect(combinationAvailable(purchased)).toBe(true);
    const stopped = stopDemoReviewSale(purchased);
    expect(combinationAvailable(stopped)).toBe(false);
    expect(stopped.owned).toBe(true);
    expect(purchaseDemoSet(stopped, 'new-order', [5, 5]).reason).toBe('InvalidAttestation');
  });

  it('compares real SHA-256 values and blocks changed bytes', async () => {
    const purchased = purchaseDemoSet(initialTransactionDemoState(), 'purchase', [5, 5]).state;
    const original = await checkDemoDownload(purchased, originalDemoFile);
    const changed = await checkDemoDownload(purchased, changedDemoFile);
    expect(original.allowed).toBe(true);
    expect(changed.allowed).toBe(false);
    expect(changed.expectedHash).not.toBe(changed.receivedHash);
    expect((await checkDemoDownload(initialTransactionDemoState(), originalDemoFile)).allowed).toBe(false);
  });
});
