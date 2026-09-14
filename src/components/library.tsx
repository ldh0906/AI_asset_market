import { useState } from 'react';
import type { CatalogItem, FreeClaim, Purchase, Sale, Version } from '../domain/model';
import { api } from '../client/api';
import { UsageGuide } from './usage-guide';
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export function Library({ purchases, items, freeClaims, freeItems, sales, busy, run }: { purchases: Purchase[]; items: (Version & { title?: string })[]; freeClaims: FreeClaim[]; freeItems: CatalogItem[]; sales: Sale[]; busy: boolean; run: Run }) {
  const [txHash, setTxHash] = useState('');
  return <section><h1>보관함·거래 내역</h1><p className="muted">받은 무료 패키지와 구매한 상품의 파일과 설치 안내를 확인하세요.</p>
    <h2>받은 무료 패키지</h2>{!freeClaims.length && <p className="empty">아직 받은 무료 패키지가 없습니다. 둘러보기에서 필요한 패키지를 찾아보세요.</p>}
    {freeClaims.map(claim => { const item = freeItems.find(i => i.version.id === claim.versionId); return item && <article className="asset free-library-item" key={claim.id}><img src={item.asset.coverPath} alt={`${item.asset.title} 표지 일러스트`} /><div><h3>{item.asset.title}</h3><p>{item.asset.summary}</p><p className="muted small">받은 날짜 {new Date(claim.createdAt).toLocaleDateString('ko-KR')}</p><div className="toolbar"><a className="button-link" href={`/api/market/download/${item.version.id}`}>ZIP 다운로드</a><a href={`/products/${item.asset.id}`}>설치 안내 보기</a></div><p className="hash">ZIP SHA-256: {item.version.fileHash}</p></div></article>; })}
    <h2>구매한 상품</h2><p className="muted small">유료 파일은 다운로드할 때 체인의 구매 권한과 파일 해시를 다시 확인합니다.</p>
    {!purchases.length && <p className="empty">아직 구매한 상품이 없습니다.</p>}
    {purchases.map(p => <article className="asset" key={p.id}><h2>구매 {p.total} TEST</h2><p>{new Date(p.createdAt).toLocaleString('ko-KR')}</p>
      <ul>{p.versionIds.map(id => { const v = items.find(i => i.id === id); return <li key={id}>{v?.title ?? '상품'} v{v?.version} <a href={`/api/market/download/${id}`}>구매 버전 다운로드</a>{v?.state === 'suspended' && <p className="notice error">{v.statusReason ?? '신규 판매가 중지된 버전입니다.'}</p>}{v && <UsageGuide version={v} />}<details><summary>사용 범위·알려진 한계</summary><p className="pre-wrap">{v?.license}</p><ul>{v?.limitations.map(l => <li key={l}>{l}</li>)}</ul><p className="hash">파일 SHA-256: {v?.fileHash}</p></details></li>; })}</ul>
      <details><summary>정산·거래 근거</summary><ul>{p.settlements.map((s, i) => <li key={i}><span className="hash">{s.seller}</span>: {s.amount} TEST</li>)}</ul><p>플랫폼 수수료 {p.platformFee} TEST</p><p className="hash">거래: {p.txHash}</p></details>
    </article>)}
    <details className="panel"><summary>성공한 거래 다시 동기화</summary><form className="toolbar" onSubmit={e => { e.preventDefault(); void run(() => api('receipt', { txHash }), '거래 내역을 동기화했습니다.'); }}><label>거래 해시<input value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x…" required /></label><button disabled={busy}>내 거래 동기화</button></form></details>
    <h2>내 상품 판매 내역</h2>{!sales.length ? <p className="muted">아직 판매 내역이 없습니다.</p> : <><p>총 수령액 <strong>{sales.reduce((sum, sale) => sum + BigInt(sale.sellerAmount), 0n).toString()} TEST</strong></p>{sales.map(s => <article className="panel" key={`${s.txHash}-${s.versionId}`}><h3>{s.title} v{s.version}</h3><p>{new Date(s.createdAt).toLocaleString('ko-KR')}</p><p>이 상품의 내 수령액 <strong>{s.sellerAmount} TEST</strong></p><p className="hash">수령 지갑: {s.seller}</p><p className="hash">거래: {s.txHash}</p></article>)}</>}
  </section>;
}
