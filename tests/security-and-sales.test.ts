import { expect, it } from 'vitest';
import { securityBenchmark } from '../evaluator/security-benchmark.mjs';
import { salesFor } from '../src/domain/sales';
import type { Asset, Purchase, Version } from '../src/domain/model';

it('reports measured false positives and false negatives with explicit denominators', () => {
  const b = securityBenchmark();
  expect(b).toMatchObject({ truePositive: 3, falseNegative: 3, falsePositive: 2, trueNegative: 3, detectionRate: 0.5, falsePositiveRate: 0.4 });
  expect(b.cases).toHaveLength(11);
  expect(b.cases.find(c => c.name === '일반 참고 URL')).toMatchObject({ expectedRisk: false, detected: false });
  expect(b.cases.find(c => c.name === '보안 교육 문서의 인용')).toMatchObject({ expectedRisk: false, detected: true });
  expect(b.cases.find(c => c.name === '동일 의미의 우회 표현')).toMatchObject({ expectedRisk: true, detected: false });
});
it('attributes item settlement amounts to their exact version and owner', () => {
  const versions = [{ id: 'v1', assetId: 'a1', ownerId: 'seller1', version: '1.0.0' }, { id: 'v2', assetId: 'a2', ownerId: 'seller2', version: '2.0.0' }, { id: 'v3', assetId: 'a3', ownerId: 'seller1', version: '3.0.0' }] as Version[];
  const assets = [{ id: 'a1', title: 'One' }, { id: 'a2', title: 'Two' }, { id: 'a3', title: 'Three' }] as Asset[];
  const purchases: Purchase[] = [{ id: 'purchase', ownerId: 'buyer', buyer: '0x1234', total: '160', platformFee: '15', versionIds: ['v2', 'v1', 'v3'], txHash: '0x1', createdAt: 'date', settlements: [{ seller: 'wallet2', amount: '80' }, { seller: 'wallet1', amount: '40' }, { seller: 'wallet1', amount: '25' }] }];
  const sales = salesFor('seller1', assets, versions, purchases);
  expect(sales.map(s => [s.versionId, s.title, s.sellerAmount])).toEqual([['v1', 'One', '40'], ['v3', 'Three', '25']]);
  expect(sales.reduce((sum, s) => sum + BigInt(s.sellerAmount), 0n)).toBe(65n);
});
