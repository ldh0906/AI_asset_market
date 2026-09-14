'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../client/api';
import { connectWallet, buyWithWallet, receiveTestCredits } from '../client/wallet';
import { Catalog } from './catalog';
import { Seller } from './seller';
import { Recommendation } from './recommendation';
import { Library } from './library';
import { Modal } from './modal';
import { ModelTests } from './model-tests';
import type { Asset, CatalogItem, FreeClaim, ModelJob, Offer, Purchase, Report, Sale, Version } from '../domain/model';
type Workspace = { assets: Asset[]; versions: Version[]; reports: Report[]; offers: Offer[]; purchases: Purchase[]; purchasedItems: (Version & { title?: string })[]; sales: Sale[]; freeClaims: FreeClaim[] };
const empty: Workspace = { assets: [], versions: [], reports: [], offers: [], purchases: [], purchasedItems: [], sales: [], freeClaims: [] };
type Tab = 'catalog' | 'recommend' | 'seller' | 'library';
export function MarketApp() {
  const [tab, setTab] = useState<Tab>('catalog'), [items, setItems] = useState<CatalogItem[]>([]), [workspace, setWorkspace] = useState<Workspace>(empty);
  const [session, setSession] = useState<{ user: { id: string; name: string } | null; local: boolean; aiConfigured: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [loginOpen, setLoginOpen] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [checkout, setCheckout] = useState<any>(null), [accepted, setAccepted] = useState(false);
  const [jobs, setJobs] = useState<ModelJob[]>([]), [activeJob, setActiveJob] = useState<string | null>(null);
  const pause = useRef(false);
  async function refresh() {
    const [s, c] = await Promise.all([api('session'), api('catalog')]);
    setSession(s); setItems(c.items);
    const [w, j] = s.user ? await Promise.all([api('workspace'), api('evaluation-jobs')]) : [empty, { jobs: [] }];
    setWorkspace(w); setJobs(j.jobs);
  }
  useEffect(() => { const chosen = new URLSearchParams(window.location.search).get('tab'); if (chosen === 'library' || chosen === 'seller' || chosen === 'recommend') setTab(chosen); refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function run(fn: () => Promise<unknown>, success = '') {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); if (success) setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : '처리하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  function navigate(next: Tab) { setTab(next); setMessage(''); setError(''); }
  function createModelTest(versionIds: string[]) { void run(async () => { await api('evaluation-jobs/create', { versionIds }); }, '비교 시험을 준비했습니다. 아래 과제와 호출 한도를 확인한 뒤 남은 시험 실행을 누르세요.'); }
  function resumeModelTest(initial: ModelJob) { void run(async () => {
    pause.current = false; setActiveJob(initial.id);
    try {
      let job = initial;
      do {
        job = await api('evaluation-jobs/step', { id: job.id });
        setJobs(previous => previous.map(j => j.id === job.id ? job : j));
      } while (job.status === 'pending' && !pause.current);
      if (job.status === 'failed') throw new Error(job.error ?? '모델 시험에 실패했습니다.');
      setMessage(job.status === 'completed' ? '모든 비교 과제를 완료하고 실제 시험 결과를 저장했습니다.' : job.status === 'running' ? '서버에서 현재 과제를 실행하고 있습니다. 잠시 후 상태를 확인하세요.' : '완료한 과제를 저장했습니다. 남은 시험은 이어서 실행할 수 있습니다.');
    } finally { setActiveJob(null); }
  }); }
  function buy(ids: string[]) {
    if (!session?.user) { setLoginOpen(true); return; }
    void run(async () => { setCheckout(await api('quote', { versionIds: ids })); setAccepted(false); });
  }
  return <>
    <header className="header"><a className="brand" href="/">AI 에셋마켓</a><nav aria-label="주 메뉴">{([['catalog', '둘러보기'], ['recommend', '구성 추천'], ['seller', '판매자 작업실'], ['library', '보관함']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'nav-button active' : 'nav-button'} onClick={() => navigate(id)}>{label}</button>)}</nav>
      <div className="account">{session?.user ? <><span>{session.user.name}</span><button className="secondary" disabled={busy} onClick={() => void run(async () => { await api('logout', {}); setCheckout(null); })}>로그아웃</button>{!session.local && (tab === 'seller' || tab === 'recommend') && <><button className="secondary" disabled={busy} onClick={() => void run(connectWallet, '지갑을 연결했습니다.')}>지갑 연결</button><button className="secondary" disabled={busy} onClick={() => void run(receiveTestCredits, '테스트 자산을 받았습니다.')}>테스트 자산 받기</button></>}</> : <button onClick={() => setLoginOpen(true)}>로그인</button>}</div>
    </header>
    {session?.local && <div className="dev-bar"><strong>로컬 개발 환경</strong><span>개발용 지갑을 자동으로 제공합니다. 별도 지갑 설치 없이 계정을 전환해 사용하세요. TEST는 가치가 없는 테스트 자산입니다.</span><select aria-label="로컬 테스트 계정" value="" disabled={busy} onChange={e => { if (e.target.value) void run(() => api('login', { role: e.target.value }), '테스트 계정을 전환했습니다.'); }}><option value="">계정 전환</option><option value="seller">판매자 하나</option><option value="seller2">판매자 둘</option><option value="buyer">구매자</option></select></div>}
    {session && !session.local && (tab === 'seller' || tab === 'recommend') && <div className="dev-bar"><span>유료 상품의 판매 조건 서명과 구매에만 브라우저 지갑이 필요합니다. 무료 패키지는 지갑 없이 받을 수 있습니다.</span><a href="https://support.metamask.io/start/getting-started-with-metamask" target="_blank" rel="noopener noreferrer">지갑 만들기 안내</a></div>}
    <main className="main" aria-busy={busy || loading}>
      {error && <div role="alert" className="notice error">{error}<button className="secondary" onClick={() => setError('')}>닫기</button></div>}
      {message && <p role="status" className="notice">{message}</p>}
      {busy && <p role="status" className="working">처리 중입니다. 지갑을 사용하는 경우 승인 창을 확인하세요.</p>}
      {loading ? <p>상품과 연결 상태를 불러오는 중입니다.</p> : <>
        {tab === 'catalog' && <Catalog items={items} />}
        {tab !== 'catalog' && !session?.user ? <div className="empty"><h1>로그인 후 사용할 수 있습니다.</h1><button onClick={() => setLoginOpen(true)}>로그인</button></div> : <>
          {tab === 'recommend' && <Recommendation items={items} busy={busy} run={run} onBuy={buy} aiConfigured={!!session?.aiConfigured} onModelTest={createModelTest} />}
          {tab === 'seller' && <Seller {...workspace} local={!!session?.local} busy={busy} run={run} aiConfigured={!!session?.aiConfigured} onModelTest={createModelTest} />}
          {(tab === 'seller' || tab === 'recommend') && <ModelTests jobs={jobs} reports={workspace.reports} active={activeJob} busy={busy} configured={!!session?.aiConfigured} onResume={resumeModelTest} onPause={() => { pause.current = true; setMessage('현재 과제가 끝나면 일시 정지합니다.'); }} onCancel={id => void run(() => api('evaluation-jobs/cancel', { id }), '시험을 취소했습니다.')} />}
          {tab === 'library' && <Library purchases={workspace.purchases} items={workspace.purchasedItems} freeClaims={workspace.freeClaims} freeItems={items.filter(i => i.version.freePackage)} sales={workspace.sales} busy={busy} run={run} />}
        </>}
      </>}
    </main>
    <footer>상품 버전에 연결된 시험 근거와 판매 조건을 확인하세요. 테스트 거래는 파일 전달이나 업무 성공 자체를 보장하지 않습니다.<a className="demo-entry" href="/demo">데모로 들어가기</a></footer>
    {loginOpen && <Modal titleId="login-title" onClose={() => setLoginOpen(false)}><h2 id="login-title">로그인</h2>
      {session?.local ? <><p>로컬 개발용 계정으로 흐름을 확인합니다.</p><div className="toolbar">{[['seller', '판매자 하나'], ['seller2', '판매자 둘'], ['buyer', '구매자']].map(([role, name]) => <button key={role} disabled={busy} onClick={() => void run(async () => { await api('login', { role }); setLoginOpen(false); })}>{name}</button>)}</div></> :
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await api('login', { email, password }); if (result.message) setMessage(result.message); else setLoginOpen(false); }); }}>
          <p className="muted small">이메일은 로그인 아이디로 사용합니다. 실제 메일함이 없어도 가입할 수 있으며 인증 메일을 보내지 않습니다.</p>
          <label>이메일<input type="email" autoComplete="email" placeholder="예: my-test@example.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>비밀번호<input type="password" autoComplete="current-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required /></label>
          <div className="toolbar"><button disabled={busy}>로그인</button><button type="button" className="secondary" disabled={busy} onClick={() => void run(async () => { const r = await api('login', { email, password, signup: true }); setMessage(r.message ?? '가입했습니다.'); setLoginOpen(false); })}>회원가입</button></div>
        </form>}
      <button className="secondary" onClick={() => setLoginOpen(false)}>닫기</button>
    </Modal>}
    {checkout && <Modal titleId="checkout-title" onClose={() => { if (!busy) setCheckout(null); }}><h2 id="checkout-title">최종 구매 조건</h2>
      <ol>{checkout.items.map((i: CatalogItem) => <li key={i.version.id}><strong>{i.asset.title} v{i.version.version}</strong><p className="pre-wrap">{i.version.license}</p><p>판매자 {i.offer!.terms.sellerAmount} TEST / 수수료 {i.offer!.terms.platformFee} TEST</p></li>)}</ol>
      <p>할인 {checkout.discount} TEST · 할인 후 플랫폼 몫 {checkout.platformFee} TEST</p><p className="checkout-total">총 {checkout.total} TEST</p><p className="muted">네트워크 비용은 별도입니다. 즉시 정산되며 자동 환불 기능은 없습니다. 테스트 자산으로만 거래하세요.</p>
      <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />버전·이용 조건·최종 금액을 확인했습니다.</label>
      <div className="toolbar"><button disabled={busy || !accepted} onClick={() => void run(async () => {
        const ids = checkout.items.map((i: CatalogItem) => i.version.id);
        if (session?.local) await api('purchase', { versionIds: ids, quoteHash: checkout.quoteHash }); else await buyWithWallet(ids, checkout.quoteHash);
        setCheckout(null); setTab('library');
      }, '구매 권한 발급과 정산이 완료됐습니다. 보관함에서 해당 버전을 내려받으세요.')}>구매 승인</button><button className="secondary" disabled={busy} onClick={() => setCheckout(null)}>취소</button></div>
    </Modal>}
  </>;
}
