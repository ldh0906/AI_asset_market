import type { Asset, Purchase, Sale, Version } from './model';

export function salesFor(ownerId: string, assets: Asset[], versions: Version[], purchases: Purchase[]): Sale[] {
  return purchases.flatMap(p => p.versionIds.flatMap((id, index) => {
    const version = versions.find(v => v.id === id && v.ownerId === ownerId), settlement = p.settlements[index];
    if (!version || !settlement) return [];
    return [{ versionId: id, title: assets.find(a => a.id === version.assetId)?.title ?? version.fileName, version: version.version,
      txHash: p.txHash, createdAt: p.createdAt, seller: settlement.seller, sellerAmount: settlement.amount }];
  }));
}
