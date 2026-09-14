'use client';
import { useEffect, useMemo, useState } from 'react';
import { freePackages } from '../domain/free-packages';
import { demoExamples } from '../domain/demo-content';
import { Modal } from './modal';

type DemoProduct = {
  id: string; title: string; description: string; seller: string; price: number; cover: string;
  purpose: string; tools: string[]; contents: string[]; prerequisites: string;
  installation: string; terms: string; limitation: string; checked: string[];
  free: boolean; demoKey: string; exampleTools?: string[];
};
const freeProducts: DemoProduct[] = freePackages.map(({ asset, version, report }) => ({
  id: asset.id, title: asset.title, description: asset.summary, seller: asset.sellerName ?? 'AI 에셋마켓 운영팀',
  price: 0, cover: asset.coverPath ?? '/covers/default.svg', purpose: asset.purpose ?? '스킬',
  tools: asset.supportedTools ?? [], contents: asset.contents ?? [], prerequisites: asset.prerequisites ?? '',
  installation: asset.installation ?? '', terms: version.license, limitation: version.limitations.join(' '),
  checked: report?.security.scanned ?? [], free: true, demoKey: version.packageKey ?? '',
}));
const paidProducts: DemoProduct[] = [
  { id: 'review', title: '코드 위험 패턴 점검', description: '코드의 지정된 위험 패턴을 점검하고 JSON으로 정리하는 체험용 Skill입니다.', seller: '예제 판매자 하나', price: 100, cover: '/covers/demo-review.svg', purpose: '코드 점검', tools: ['code.review'], contents: ['review.json'], prerequisites: '데모 실행기', installation: '보관함에서 예제 JSON 구조를 살펴보세요.', terms: '데모에서만 사용하는 공개 예제입니다.', limitation: '별칭·난독화와 전체 취약점 분석은 지원하지 않습니다. 실제 시험 성적은 제공하지 않습니다.', checked: [], free: false, demoKey: 'review', exampleTools: ['code.review'] },
  { id: 'report', title: '점검·집계 보고서', description: '점검 또는 집계 JSON을 마크다운 보고서로 변환하는 체험용 Skill입니다.', seller: '예제 판매자 둘', price: 100, cover: '/covers/demo-report.svg', purpose: '보고서 작성', tools: ['report.markdown'], contents: ['report.json'], prerequisites: '데모 실행기', installation: '보관함에서 예제 JSON 구조를 살펴보세요.', terms: '데모에서만 사용하는 공개 예제입니다.', limitation: '입력 결과를 정리하며 새로운 분석은 추가하지 않습니다. 실제 시험 성적은 제공하지 않습니다.', checked: [], free: false, demoKey: 'report', exampleTools: ['report.markdown'] },
  { id: 'complete', title: '코드 점검과 보고서 단품', description: '코드 점검부터 마크다운 보고서까지 한 상품으로 구성한 체험용 Skill입니다.', seller: '예제 판매자 하나', price: 150, cover: '/covers/demo-complete.svg', purpose: '코드 점검', tools: ['code.review', 'report.markdown'], contents: ['complete.json'], prerequisites: '데모 실행기', installation: '보관함에서 예제 JSON 구조를 살펴보세요.', terms: '데모에서만 사용하는 공개 예제입니다.', limitation: '지정된 코드 패턴만 확인하며 실제 업무 품질은 미평가입니다.', checked: [], free: false, demoKey: 'complete', exampleTools: ['code.review', 'report.markdown'] },
];
const products = [...freeProducts, ...paidProducts];
type Tab = 'catalog' | 'recommend' | 'library';
function pathProduct() { return window.location.pathname.match(/^\/demo\/products\/([^/]+)\/?$/)?.[1] ?? null; }

function DemoStory({ product }: { product: DemoProduct }) {
  const example = demoExamples[product.demoKey];
  return <section className="detail-section seller-story" aria-labelledby="demo-story-title">
    <div className="section-title"><div><h2 id="demo-story-title">상품 소개</h2><p>{product.free ? '운영팀 상품 정보와 가상 사용 장면' : '예제 판매자 작성 형식의 가상 소개'}</p></div></div>
    <div className="story-prose"><p>{product.description}</p><p>{example.lead}</p>
      <figure className="demo-story-figure"><img src={product.cover} alt={`${product.title}의 데모용 시각 예시`} /><figcaption>데모용 일러스트 · 실제 실행 화면이나 시험 결과 캡처가 아닙니다.</figcaption></figure>
      <h3>가상 사용 순서</h3><ol>{example.steps.map(step => <li key={step}>{step}</li>)}</ol>
      {product.free && <p>실제 ZIP과 설치 안내는 운영 사이트에서 로그인 후 받을 수 있습니다.</p>}
    </div>
  </section>;
}

function DemoReport({ product }: { product: DemoProduct }) {
  const example = demoExamples[product.demoKey];
  const passed = example.cases.filter(item => item.passed).length;
  return <section className="detail-section inspection" aria-labelledby="demo-report-title">
    <div className="section-title"><div><h2 id="demo-report-title">사이트 검사·시험 결과</h2><p>데모용 가상 보고서 · 실제 모델·보안 시험 기록이 아닙니다</p></div></div>
    <div className="demo-report-disclaimer" role="note"><strong>가상 예시</strong> 아래의 과제, 개별 판정, {passed}/{example.cases.length} 수치는 화면 체험을 위해 만든 값입니다. 실제 실행하거나 측정하지 않았습니다.</div>
    <div className="inspection-summary"><div><span className="tag sage">가상 판정 예시 {passed}/{example.cases.length}</span><p>{example.task}</p></div><div><strong>주요 한계</strong><p>{product.limitation}</p></div></div>
    <details><summary>가상 개별 판정과 실제 확인 범위 보기</summary>
      <dl className="facts"><div><dt>예시 환경</dt><dd>{example.environment}</dd></div><div><dt>실제 실행일</dt><dd>없음 · 데모 시나리오</dd></div><div><dt>판정 기준</dt><dd>화면 시연용 가정</dd></div><div><dt>실제 검사자</dt><dd>없음</dd></div></dl>
      <h3>가상 개별 판정</h3><ul className="demo-case-list">{example.cases.map(item => <li key={item.name}><span className={item.passed ? 'tag sage' : 'tag'}>{item.passed ? '예시 통과' : '예시 미통과'}</span><div><strong>{item.name}</strong><p>{item.detail}</p></div></li>)}</ul>
      <h3>실제로 확인한 범위</h3>{product.free ? <><p>운영 사이트에서 제공하는 무료 ZIP의 파일 구성 검사입니다. 위의 가상 판정과는 별개입니다.</p><ul>{product.checked.map(item => <li key={item}>{item}</li>)}</ul></> : <p>이 상품은 데모 전용 가상 상품이며 실제 파일·성능 검사 기록이 없습니다.</p>}
      <p className="muted">AI 작업 성능, 스킬 조합 효과, 실제 사용 환경의 결과는 미평가입니다.</p>
    </details>
  </section>;
}

export function DemoMarket({ initialProductId = null }: { initialProductId?: string | null }) {
  const [tab, setTab] = useState<Tab>('catalog'), [productId, setProductId] = useState(initialProductId);
  const [owned, setOwned] = useState<string[]>([]), [selected, setSelected] = useState<DemoProduct | null>(null);
  const [message, setMessage] = useState(''), [budget, setBudget] = useState('200');
  const [query, setQuery] = useState(''), [purpose, setPurpose] = useState('all'), [tool, setTool] = useState('all'), [cost, setCost] = useState('all');
  const [returnScroll, setReturnScroll] = useState(0);
  useEffect(() => {
    const onBack = () => { const id = pathProduct(); setProductId(id); setSelected(null); if (!id) requestAnimationFrame(() => window.scrollTo(0, returnScroll)); };
    window.addEventListener('popstate', onBack); return () => window.removeEventListener('popstate', onBack);
  }, [returnScroll]);
  const purposes = useMemo(() => [...new Set(products.map(p => p.purpose))].sort(), []);
  const tools = useMemo(() => [...new Set(products.flatMap(p => p.tools))].sort(), []);
  const filtered = products.filter(p => `${p.title} ${p.description}`.toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR'))
    && (purpose === 'all' || p.purpose === purpose) && (tool === 'all' || p.tools.includes(tool))
    && (cost === 'all' || (cost === 'free') === p.free));
  const detail = products.find(p => p.id === productId);
  function openProduct(id: string) { setReturnScroll(window.scrollY); window.history.pushState(null, '', `/demo/products/${id}`); setProductId(id); setMessage(''); window.scrollTo(0, 0); }
  function backToBrowse() { window.history.pushState(null, '', '/demo'); setProductId(null); setTab('catalog'); requestAnimationFrame(() => window.scrollTo(0, returnScroll)); }
  function chooseTab(next: Tab) { if (productId) { window.history.pushState(null, '', '/demo'); setProductId(null); } setTab(next); setMessage(''); window.scrollTo(0, 0); }
  function receive(product: DemoProduct) {
    if (product.free) { setOwned(ids => ids.includes(product.id) ? ids : [...ids, product.id]); chooseTab('library'); setMessage('데모 보관함에 담았습니다. 실제 ZIP은 실제 사이트에서 로그인 후 받을 수 있습니다.'); }
    else setSelected(product);
  }
  function productLink(product: DemoProduct, children: React.ReactNode, className?: string) {
    return <a className={className} href={`/demo/products/${product.id}`} onClick={event => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); openProduct(product.id); }}>{children}</a>;
  }
  function row(product: DemoProduct) {
    return <article className="product-row" key={product.id}>{productLink(product, <img src={product.cover} alt={`${product.title} 표지`} />, 'row-cover')}
      <div className="row-copy"><div className="row-tags"><span className="tag">{product.purpose}</span><span className="tag sage">{product.free ? '무료 패키지' : '가상 상품'}</span></div><h3>{productLink(product, product.title)}</h3><p>{product.description}</p></div>
      <div className="row-action"><strong>{product.free ? '무료' : `${product.price} 데모 TEST`}</strong>{productLink(product, '상세보기', 'button-link')}</div></article>;
  }
  return <>
    <header className="header"><a className="brand" href="/demo" onClick={event => { event.preventDefault(); backToBrowse(); }}>AI 에셋마켓 · 데모</a><nav aria-label="데모 메뉴">
      {([['catalog', '둘러보기'], ['recommend', '구성 추천'], ['library', '보관함']] as const).map(([id, label]) => <button key={id} className={tab === id && !productId ? 'nav-button active' : 'nav-button'} onClick={() => chooseTab(id)}>{label}</button>)}<a href="/demo/transactions">거래 안전성</a>
    </nav><div className="account"><a href="/">실제 사이트로 돌아가기</a></div></header>
    <div className="demo-notice"><strong>체험용 데모</strong><span>상세의 시험 판정과 유료 상품 이미지는 가상 예시입니다. 실제 실행·측정한 결과가 아닙니다. 수령·구매 기록은 새로고침하면 초기화됩니다.</span></div>
    <main className={productId ? 'main detail-main demo-main' : 'main demo-main'}>
      {message && <p role="status" className="notice">{message}</p>}
      {productId && !detail && <div className="empty"><h1>데모 상품을 찾지 못했습니다.</h1><button onClick={backToBrowse}>둘러보기로 돌아가기</button></div>}
      {detail && <><button className="demo-back" onClick={backToBrowse}>← 둘러보기로 돌아가기</button>
        <div className="detail-hero"><div className="detail-head"><span className="tag">{detail.free ? '무료 패키지' : '가상 Skill'}</span><h1>{detail.title}</h1><p className="seller-byline">{detail.seller}</p><p className="detail-summary">{detail.description}</p></div><figure className="demo-cover"><img className="detail-cover" src={detail.cover} alt={`${detail.title} 표지`} /><figcaption>{detail.free ? '상품용 일러스트 · 실행 결과 이미지 아님' : '데모용 가상 대표 이미지 · 실제 상품 이미지 아님'}</figcaption></figure></div>
        <section className="detail-section" aria-labelledby="demo-facts"><h2 id="demo-facts">구성과 사용 정보</h2><dl className="detail-facts"><div><dt>지원 도구</dt><dd>{detail.tools.join(', ')}</dd></div><div><dt>버전</dt><dd>1.0.0</dd></div><div><dt>구성품</dt><dd>{detail.contents.join(', ')}</dd></div><div><dt>필수 조건</dt><dd>{detail.prerequisites}</dd></div><div><dt>설치 방법</dt><dd>{detail.installation}</dd></div><div><dt>이용 조건</dt><dd>{detail.terms}</dd></div></dl></section>
        <DemoStory product={detail} />
        <DemoReport product={detail} />
      </>}
      {!productId && tab === 'catalog' && <section className="browse"><div className="browse-intro"><div><h1>필요한 작업에서 시작하세요</h1><p>실제 무료 패키지와 가상 상품을 살펴보고, 수령과 구매 흐름을 체험해 보세요.</p></div><span className="intro-mark" aria-hidden="true">✳</span></div>
        <section className="featured" aria-labelledby="demo-featured-title"><div className="section-title"><div><h2 id="demo-featured-title">무료로 시작하는 네 가지 방법</h2><p>실제 사이트의 스킬 패키지를 데모에서 둘러볼 수 있습니다.</p></div><span>4개 패키지</span></div><div className="feature-grid">{freeProducts.map(product => <article className="feature-card" key={product.id}>{productLink(product, <img src={product.cover} alt={`${product.title} 표지 일러스트`} />)}<div className="feature-copy"><span className="tag">무료 패키지</span><h3>{productLink(product, product.title)}</h3><p>{product.description}</p>{productLink(product, '구성 살펴보기', 'text-link')}</div></article>)}</div></section>
        <section className="catalog-section" aria-labelledby="demo-catalog-title"><div className="section-title"><div><h2 id="demo-catalog-title">전체 상품</h2><p>검색과 필터를 조합해 상품을 찾으세요.</p></div><span>{filtered.length}개 결과</span></div><div className="catalog-filters"><label>검색<input value={query} onChange={event => setQuery(event.target.value)} placeholder="상품명 또는 소개 검색" /></label><label>용도<select value={purpose} onChange={event => setPurpose(event.target.value)}><option value="all">모든 용도</option>{purposes.map(p => <option key={p} value={p}>{p}</option>)}</select></label><label>지원 도구<select value={tool} onChange={event => setTool(event.target.value)}><option value="all">모든 도구</option>{tools.map(t => <option key={t} value={t}>{t}</option>)}</select></label><label>가격<select value={cost} onChange={event => setCost(event.target.value)}><option value="all">전체</option><option value="free">무료</option><option value="paid">유료</option></select></label></div>{!filtered.length && <div className="empty"><h3>조건에 맞는 상품이 없습니다.</h3><p>검색어나 필터를 바꿔 다시 살펴보세요.</p><button className="secondary" onClick={() => { setQuery(''); setPurpose('all'); setTool('all'); setCost('all'); }}>필터 초기화</button></div>}<div className="product-rows">{filtered.map(row)}</div></section></section>}
      {!productId && tab === 'recommend' && <section className="demo-section"><span className="tag sage">가상 추천</span><h1>작업에 필요한 구성 고르기</h1><p>예제 작업: 코드를 점검하고 마크다운 보고서 만들기</p><label className="demo-budget">예산 (데모 TEST)<input type="number" min="0" step="1" value={budget} onChange={event => setBudget(event.target.value)} /></label>{budget.trim() !== '' && Number(budget) >= 150 ? <><p className="notice">예제 조건에서는 150 TEST 단품이 두 상품의 200 TEST 합계보다 저렴합니다. 실제 성능 개선은 측정하지 않았습니다.</p><div className="product-rows">{row(paidProducts[2])}</div></> : <p className="empty">이 예제 작업의 최소 구성 가격은 150 데모 TEST입니다.</p>}</section>}
      {!productId && tab === 'library' && <section className="demo-section"><span className="tag sage">데모 보관함</span><h1>내가 담은 상품</h1>{owned.length ? <div className="demo-library">{products.filter(product => owned.includes(product.id)).map(product => <article className="demo-library-item" key={product.id}><img src={product.cover} alt="" /><div><span className="tag">{product.free ? '무료로 받음' : '가상 구매 완료'}</span><h2>{product.title}</h2><p>{product.free ? '실제 ZIP은 실제 사이트에서 로그인 후 받을 수 있습니다.' : `예시 배분: 판매자 ${product.price - 10} / 플랫폼 10 데모 TEST. 실제 송금 기록은 아닙니다.`}</p><div className="demo-library-actions"><button className="secondary" onClick={() => openProduct(product.id)}>상세보기</button>{product.free ? <a className="button-link" href={`/products/${product.id}`}>실제 ZIP 받으러 가기</a> : <a className="button-link" download={`${product.id}-example.json`} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({ schemaVersion: 1, steps: product.exampleTools?.map(tool => ({ tool })) }, null, 2))}`}>공개 예제 파일 받기</a>}</div></div></article>)}</div> : <p className="empty">받거나 가상 구매한 상품이 여기에 나타납니다.</p>}</section>}
    </main>
    {detail && <div className="purchase-bar"><div><small>{owned.includes(detail.id) ? '데모 보관함에 있음' : detail.free ? '무료 패키지' : '가상 판매 가격'}</small><strong>{detail.free ? '무료' : `${detail.price} 데모 TEST`}</strong></div>{owned.includes(detail.id) ? <button onClick={() => chooseTab('library')}>보관함에서 보기</button> : <button onClick={() => receive(detail)}>{detail.free ? '무료로 받기' : '가상 구매'}</button>}</div>}
    <footer>데모 기록은 실제 계정·상품·구매 내역에 저장되지 않습니다.</footer>
    {selected && <Modal titleId="demo-purchase-title" onClose={() => setSelected(null)}><h2 id="demo-purchase-title">가상 구매 확인</h2><p>{selected.title} · v1.0.0</p><p>실제 상품 구매 권한이나 정산은 발생하지 않습니다.</p><p>판매자 {selected.price - 10} / 플랫폼 10 데모 TEST</p><p className="checkout-total">총 {selected.price} 데모 TEST</p><div className="toolbar"><button onClick={() => { setOwned(ids => ids.includes(selected.id) ? ids : [...ids, selected.id]); setSelected(null); chooseTab('library'); setMessage('가상 구매를 완료했습니다. 보관함에서 공개 예제 파일을 확인하세요.'); }}>가상 구매 완료하기</button><button className="secondary" onClick={() => setSelected(null)}>취소</button></div></Modal>}
  </>;
}
