'use client';
import { useEffect, useMemo, useState } from 'react';
import type { CatalogItem } from '../domain/model';

function price(item: CatalogItem) {
  if (item.version.freePackage) return '무료';
  return item.offer ? `${(BigInt(item.offer.terms.sellerAmount) + BigInt(item.offer.terms.platformFee)).toString()} TEST` : '구매 불가';
}
function detailLink(item: CatalogItem) { return `/products/${item.asset.id}`; }
export function Catalog({ items }: { items: CatalogItem[] }) {
  const [query, setQuery] = useState(''), [purpose, setPurpose] = useState('all'), [tool, setTool] = useState('all'), [cost, setCost] = useState('all');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let params = new URLSearchParams(window.location.search);
    const saved = sessionStorage.getItem('catalog-return-query');
    if (saved && !['q', 'purpose', 'tool', 'cost'].some(key => params.has(key))) params = new URLSearchParams(saved);
    sessionStorage.removeItem('catalog-return-query');
    setQuery(params.get('q') ?? ''); setPurpose(params.get('purpose') ?? 'all'); setTool(params.get('tool') ?? 'all'); setCost(params.get('cost') ?? 'all');
    setReady(true);
    const scroll = sessionStorage.getItem('catalog-scroll');
    if (scroll) { sessionStorage.removeItem('catalog-scroll'); requestAnimationFrame(() => window.scrollTo(0, Number(scroll))); }
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    for (const key of ['q', 'purpose', 'tool', 'cost']) params.delete(key);
    if (query) params.set('q', query); if (purpose !== 'all') params.set('purpose', purpose); if (tool !== 'all') params.set('tool', tool); if (cost !== 'all') params.set('cost', cost);
    const search = params.toString(); window.history.replaceState(null, '', `/${search ? `?${search}` : ''}`);
  }, [query, purpose, tool, cost, ready]);
  const purposes = useMemo(() => [...new Set(items.map(i => i.asset.purpose).filter((x): x is string => !!x))].sort(), [items]);
  const tools = useMemo(() => [...new Set(items.flatMap(i => i.asset.supportedTools ?? []).filter(Boolean))].sort(), [items]);
  const filtered = items.filter(i => {
    const words = `${i.asset.title} ${i.asset.summary}`.toLocaleLowerCase('ko-KR');
    return words.includes(query.trim().toLocaleLowerCase('ko-KR')) && (purpose === 'all' || i.asset.purpose === purpose)
      && (tool === 'all' || i.asset.supportedTools?.includes(tool)) && (cost === 'all' || (cost === 'free') === !!i.version.freePackage);
  });
  const featured = items.filter(i => i.version.freePackage);
  const remember = () => { sessionStorage.setItem('catalog-scroll', String(window.scrollY)); sessionStorage.setItem('catalog-return-query', window.location.search); };
  return <section className="browse"><div className="browse-intro"><div><h1>필요한 작업에서 시작하세요</h1><p>설치할 수 있는 스킬과 검증 근거를 살펴보고, 내 작업에 맞는 상품을 고르세요.</p></div><span className="intro-mark" aria-hidden="true">✳</span></div>
    <section className="featured" aria-labelledby="featured-title"><div className="section-title"><div><h2 id="featured-title">무료로 시작하는 네 가지 방법</h2><p>Codex와 Claude Code 프로젝트에 설치하는 실제 스킬 묶음입니다.</p></div><span>4개 패키지</span></div>
      <div className="feature-grid">{featured.map(item => <article className="feature-card" key={item.asset.id}><a href={detailLink(item)} onClick={remember}><img src={item.asset.coverPath} alt={`${item.asset.title} 표지 일러스트`} /></a><div className="feature-copy"><span className="tag">무료 패키지</span><h3><a href={detailLink(item)} onClick={remember}>{item.asset.title}</a></h3><p>{item.asset.summary}</p><a className="text-link" href={detailLink(item)} onClick={remember}>구성 살펴보기</a></div></article>)}</div></section>
    <section className="catalog-section" aria-labelledby="all-title"><div className="section-title"><div><h2 id="all-title">전체 상품</h2><p>용도와 도구를 고르면 목록이 바로 좁혀집니다.</p></div><span>{filtered.length}개 결과</span></div>
      <div className="catalog-filters"><label>검색<input value={query} onChange={e => setQuery(e.target.value)} placeholder="상품명 또는 소개 검색" /></label><label>용도<select value={purpose} onChange={e => setPurpose(e.target.value)}><option value="all">모든 용도</option>{purposes.map(p => <option key={p} value={p}>{p}</option>)}</select></label><label>지원 도구<select value={tool} onChange={e => setTool(e.target.value)}><option value="all">모든 도구</option>{tools.map(t => <option key={t} value={t}>{t}</option>)}</select></label><label>가격<select value={cost} onChange={e => setCost(e.target.value)}><option value="all">전체</option><option value="free">무료</option><option value="paid">유료</option></select></label></div>
      {!filtered.length && <div className="empty"><h3>조건에 맞는 상품이 없습니다.</h3><p>검색어나 필터를 바꿔 다시 살펴보세요.</p><button className="secondary" onClick={() => { setQuery(''); setPurpose('all'); setTool('all'); setCost('all'); }}>필터 초기화</button></div>}
      <div className="product-rows">{filtered.map(item => <article className="product-row" key={item.version.id}><a className="row-cover" href={detailLink(item)} onClick={remember}><img src={item.asset.coverPath || '/covers/default.svg'} alt={item.asset.coverPath ? `${item.asset.title} 대표 이미지` : '기본 상품 표지'} /></a><div className="row-copy"><div className="row-tags"><span className="tag">{item.asset.purpose ?? (item.asset.kind === 'skill' ? 'Skill' : '문서')}</span>{item.version.freePackage && <span className="tag sage">운영팀 구성</span>}</div><h3><a href={detailLink(item)} onClick={remember}>{item.asset.title}</a></h3><p>{item.asset.summary}</p></div><div className="row-action"><strong>{price(item)}</strong><a className="button-link" href={detailLink(item)} onClick={remember}>상세보기</a></div></article>)}</div>
    </section>
  </section>;
}
