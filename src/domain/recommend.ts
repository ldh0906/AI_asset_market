import type { CatalogItem, Intent, Recommendation, Report } from './model';
import { quote } from './pricing';
import { compositionShape, contentFormat } from './composition';
export function recommend(intent: Intent, catalog: CatalogItem[], reports: Report[], now = Date.now()): Recommendation {
  const eligible = catalog.filter(x => x.version.state === 'listed' && x.report?.eligible && !x.report.revokedAt && x.offer && !x.offer.cancelledAt
    && Number(x.offer.terms.validUntil) * 1000 > now && x.version.environment === intent.environment);
  const configurations: { items: CatalogItem[]; report: Report; total: string; discount: string }[] = [];
  function check(items: CatalogItem[], report: Report | undefined) {
    if (!items.length || !report?.eligible || report.revokedAt || report.environment !== intent.environment) return;
    let shape; try { shape = compositionShape(items.map(i => i.version)); } catch { return; }
    if (shape.input !== intent.input || shape.output !== intent.output) return;
    if (!intent.capabilities.every(c => items.some(i => i.version.capabilities.includes(c)))) return;
    if (items.length > 1 && !items.every(i => i.version.licenseHash === items[0].version.licenseHash)) return;
    if (items.length > 1 && items.some(i => contentFormat(i.version) !== 'workflow') && !report.modelEvaluation) return;
    if (report.versionIds.length !== items.length || report.fileHashes.length !== items.length) return;
    if (items.some((i, n) => report.versionIds[n] !== i.version.id || report.fileHashes[n] !== i.version.fileHash)) return;
    const q = quote(items.map(i => i.offer!.terms), items.map(i => items.length > 1 ? i.offer!.terms.maxDiscount : '0'));
    if (BigInt(q.total) <= BigInt(intent.budget)) configurations.push({ items, report, ...q });
  }
  for (const item of eligible) check([item], item.report);
  for (const report of reports.filter(r => r.kind === 'combination')) {
    const items = report.versionIds.map(id => eligible.find(i => i.version.id === id));
    if (items.every((x): x is CatalogItem => !!x)) check(items, report);
  }
  configurations.sort((a, b) => BigInt(a.total) < BigInt(b.total) ? -1 : BigInt(a.total) > BigInt(b.total) ? 1 : a.items.length - b.items.length);
  const chosen = configurations[0];
  return { status: chosen ? 'matched' : 'no-match', intent, source: 'explicit-constraints',
    items: chosen?.items ?? [], total: chosen?.total ?? '0', discount: chosen?.discount ?? '0', report: chosen?.report,
    reasons: chosen ? [chosen.items.length === 1 ? '이 단품이 요청한 기능과 입출력 조건을 충족합니다.' : '동일 환경에서 데이터 전달까지 시험한 조합입니다.',
      '현재 유효한 판매 조건과 시험 기록 중 예산 안에서 가장 낮은 가격의 구성을 선택했습니다.',
      '시험 범위를 벗어난 실제 업무 성능은 보장하지 않습니다.'] : ['입출력·기능·환경·예산을 모두 충족하는 유효한 단품 또는 시험된 조합이 없습니다. 조건을 조정해 보세요.'],
    alternatives: configurations.slice(1, 4).map(c => ({ versionIds: c.items.map(i => i.version.id), total: c.total })),
  };
}
