import { useState } from 'react';
import { capabilities, capabilityLabels, type Asset, type Capability, type Format, type Offer, type Report, type Version } from '../domain/model';
import { api } from '../client/api';
import { signSale } from '../client/wallet';
import { ReportView } from './report-view';
import { StoryEditor } from './story-editor';
const sampleLicense = '구매한 개인 또는 팀의 내부 업무에 사용할 수 있습니다. 원문 재판매와 공개 재배포는 허용하지 않습니다. 업데이트는 구매한 버전만 포함합니다.';
const samples = {
  review: { title: '코드 위험 패턴 점검', summary: '동적 실행, 문자열 비밀값, HTML 대입 패턴을 찾아 JSON 결과로 반환합니다.', tool: ['code.review'] },
  report: { title: '점검·집계 보고서 작성', summary: '지정 형식의 코드 점검 또는 데이터 집계 JSON을 마크다운 보고서로 변환합니다.', tool: ['report.markdown'] },
  data: { title: '그룹별 데이터 집계', summary: 'group,amount 형식의 단순 CSV에서 그룹별 정수 금액을 합산합니다.', tool: ['csv.summarize'] },
  complete: { title: '코드 점검과 보고서', summary: '코드 위험 패턴 점검부터 마크다운 보고서 작성까지 한 번에 실행합니다.', tool: ['code.review', 'report.markdown'] },
};
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export function Seller({ assets, versions, reports, offers, local, busy, run, aiConfigured, onModelTest }: { assets: Asset[]; versions: Version[]; reports: Report[]; offers: Offer[]; local: boolean; busy: boolean; run: Run; aiConfigured: boolean; onModelTest: (ids: string[]) => void }) {
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(''), [summary, setSummary] = useState('');
  const [kind, setKind] = useState('skill'), [version, setVersion] = useState('1.0.0'), [license, setLicense] = useState(sampleLicense);
  const [assetId, setAssetId] = useState(''), [limitations, setLimitations] = useState('지정 도구 환경만 지원합니다.');
  const [skillCapabilities, setSkillCapabilities] = useState<Capability[]>(['code-review']);
  const [input, setInput] = useState<Format>('code'), [output, setOutput] = useState<Format>('json');
  const [editingId, setEditingId] = useState<string | null>(null);
  const agentSkill = kind === 'skill' && file?.name === 'SKILL.md';
  function loadSample(key: keyof typeof samples) {
    const sample = samples[key]; setAssetId(''); setKind('skill'); setTitle(sample.title); setSummary(sample.summary); setVersion('1.0.0');
    setFile(new File([JSON.stringify({ schemaVersion: 1, steps: sample.tool.map(tool => ({ tool })) }, null, 2)], `${key}.json`, { type: 'application/json' }));
    setLimitations(key === 'data' ? 'group,amount 헤더, 정수 금액, 1,000행 이하의 CSV만 지원합니다. 통화 변환과 따옴표 필드는 미지원입니다.' : '정해진 문자열 패턴만 검사합니다. 코드의 모든 취약점을 찾지 못합니다.');
  }
  function upload() { return run(async () => {
    if (!file) throw new Error('상품 파일을 선택하세요.');
    const form = new FormData(); form.set('file', file); form.set('metadata', JSON.stringify({ assetId: assetId || undefined, title, summary, kind, version, license, limitations: limitations.split('\n').filter(Boolean), ...(agentSkill ? { capabilities: skillCapabilities, input, output } : {}) }));
    await api('assets', form); setFile(null); setTitle(''); setSummary('');
  }, '새 버전을 등록했습니다. 시험을 실행하세요.'); }
  return <section><h1>판매자 작업실</h1><p className="muted">등록 → 시험 → 판매 조건 승인 순서로 공개합니다.</p>
    <details className="panel" open><summary>상품·새 버전 등록</summary>
      <div className="toolbar"><span>예제 파일로 시작</span>{Object.entries(samples).map(([key, sample]) => <button className="secondary" type="button" key={key} onClick={() => loadSample(key as keyof typeof samples)}>{sample.title}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void upload(); }} className="form-grid">
        <label>등록 대상<select value={assetId} onChange={e => { setAssetId(e.target.value); const a = assets.find(a => a.id === e.target.value); if (a) { setTitle(a.title); setSummary(a.summary); setKind(a.kind); } }}><option value="">새 상품</option>{assets.map(a => <option key={a.id} value={a.id}>{a.title} — 새 버전</option>)}</select></label>
        <label>상품 유형<select value={kind} disabled={!!assetId} onChange={e => { setKind(e.target.value); setFile(null); }}><option value="skill">Skill (SKILL.md, .json)</option><option value="document">문서 (.md, .txt)</option></select></label>
        <label>상품명<input value={title} onChange={e => setTitle(e.target.value)} required minLength={2} maxLength={80} /></label>
        <label>버전<input value={version} onChange={e => setVersion(e.target.value)} required placeholder="1.0.0" /></label>
        <label className="span-2">상품 설명<textarea value={summary} onChange={e => setSummary(e.target.value)} required minLength={10} maxLength={500} /></label>
        <label className="span-2">상품 파일 (최대 1MB)<input type="file" accept={kind === 'skill' ? '.json,.md' : '.md,.txt'} onChange={e => setFile(e.target.files?.[0] ?? null)} /><span className="muted">{file ? `선택된 파일: ${file.name}` : 'UTF-8 파일을 선택하세요.'}</span></label>
        {agentSkill && <><fieldset className="span-2"><legend>Skill이 수행할 기능</legend><div className="checks">{capabilities.map(c => <label key={c}><input type="checkbox" checked={skillCapabilities.includes(c)} onChange={e => setSkillCapabilities(e.target.checked ? [...skillCapabilities, c] : skillCapabilities.filter(x => x !== c))} />{capabilityLabels[c]}</label>)}</div></fieldset>
          <label>Skill 입력 형식<select value={input} onChange={e => setInput(e.target.value as Format)}>{['code', 'csv', 'json', 'markdown', 'text'].map(f => <option key={f}>{f}</option>)}</select></label>
          <label>Skill 출력 형식<select value={output} onChange={e => setOutput(e.target.value as Format)}>{['code', 'csv', 'json', 'markdown', 'text'].map(f => <option key={f}>{f}</option>)}</select></label>
          <p className="span-2 muted">현재 모델 과제는 코드·CSV → JSON/Markdown, JSON → Markdown을 지원합니다. 다른 작업은 등록할 수 있으나 판매 전 평가 과제 추가가 필요합니다.</p></>}
        <label className="span-2">이용 조건<textarea value={license} onChange={e => setLicense(e.target.value)} required minLength={10} /></label>
        <label className="span-2">알려진 한계 (한 줄에 한 항목)<textarea value={limitations} onChange={e => setLimitations(e.target.value)} /></label>
        <div className="span-2"><button disabled={busy}>파일·버전 등록</button></div>
      </form>
      <details><summary>지원 Skill 형식</summary><h3>SKILL.md</h3><pre>{'---\nname: code-review\ndescription: 코드의 위험 패턴을 점검하는 지침입니다.\nallowed-tools: code.review\n---\n코드를 code.review 도구로 점검하고 규칙 이름과 행 번호를 JSON으로 반환하세요.'}</pre><p>name·description을 가진 YAML 머리말과 본문을 등록합니다. 추가 파일과 외부 실행 도구는 미지원입니다. 모델 비교 시험 완료 후 판매 조건을 승인할 수 있습니다.</p>
        <h3>지정 도구 워크플로 (.json)</h3><pre>{JSON.stringify({ schemaVersion: 1, steps: [{ tool: 'code.review' }, { tool: 'report.markdown' }] }, null, 2)}</pre><p>code.review, csv.summarize, report.markdown만 지원합니다. 임의 스크립트·외부 도구는 등록할 수 없습니다.</p></details>
    </details>
    <h2>상품 소개 작성</h2><p className="muted">상품을 고르고 본문을 작성하세요. 초안은 본인만 볼 수 있으며, 공개를 눌러야 둘러보기에 반영됩니다.</p>
    <div className="story-asset-picker">{assets.map(asset => <button key={asset.id} className="secondary" onClick={() => setEditingId(asset.id)}>{asset.title} 소개 편집</button>)}</div>
    {editingId && <StoryEditor key={editingId} assetId={editingId} onPublished={() => run(async () => {}, '공개 소개를 갱신했습니다.')} onClose={() => setEditingId(null)} />}
    <h2>내 상품 버전</h2>{!versions.length && <p className="empty">아직 등록한 상품이 없습니다.</p>}
    {versions.map(v => <article className="asset" key={v.id}><div className="asset-heading"><h3>{assets.find(a => a.id === v.assetId)?.title} <small>v{v.version}</small></h3><span className="tag">{{ draft: '등록됨', review: '시험 완료', listed: '판매 중', suspended: '판매 중지' }[v.state]}</span></div>
      <p className="muted">{v.fileName} · {v.input} → {v.output}</p>
      <div className="toolbar"><button disabled={busy || v.state === 'listed'} onClick={() => void run(() => api('evaluate', { versionIds: [v.id] }), '시험 결과를 저장했습니다.')}>시험 실행</button>
        <button className="secondary" disabled={busy || !aiConfigured || v.state === 'listed'} onClick={() => onModelTest([v.id])}>모델 비교 시험 준비</button>
        {v.state === 'listed' && <button className="danger" disabled={busy} onClick={() => void run(() => api('stop', { versionId: v.id }), '신규 판매와 추천을 중지했습니다. 기존 구매 권한은 유지됩니다.')}>판매 중지</button>}
        <a href={`/api/market/download/${v.id}`}>등록 파일 내려받기</a></div>
      {reports.find(r => r.id === v.reportId) && <ReportView report={reports.find(r => r.id === v.reportId)!} />}
      {v.state === 'review' && reports.find(r => r.id === v.reportId)?.eligible && <SaleForm versionId={v.id} local={local} busy={busy} run={run} />}
      {v.state === 'listed' && <p>승인된 판매 조건 {offers.filter(o => o.versionId === v.id && !o.cancelledAt).length}건</p>}
    </article>)}
  </section>;
}
function SaleForm({ versionId, local, busy, run }: { versionId: string; local: boolean; busy: boolean; run: Run }) {
  const [sellerAmount, setSeller] = useState('90'), [platformFee, setFee] = useState('10'), [maxDiscount, setDiscount] = useState('5');
  return <form className="sale-form" onSubmit={e => { e.preventDefault(); void run(async () => {
    const input = { versionId, sellerAmount, platformFee, maxDiscount, validDays: 30 };
    if (local) return api('publish', input);
    const { terms } = await api('terms', input); const signature = await signSale(terms); return api('publish', { versionId, terms, signature });
  }, '판매 조건에 서명하고 상품을 공개했습니다.'); }}><h4>판매 조건 승인</h4><div className="form-grid">
    <label>판매자 수령 TEST<input type="number" min="1" value={sellerAmount} onChange={e => setSeller(e.target.value)} required /></label>
    <label>플랫폼 수수료 TEST<input type="number" min="0" value={platformFee} onChange={e => setFee(e.target.value)} required /></label>
    <label>최대 세트 할인 TEST<input type="number" min="0" max={platformFee} value={maxDiscount} onChange={e => setDiscount(e.target.value)} required /></label>
  </div><p>판매자 수령액을 유지하며 플랫폼 수수료 안에서만 할인합니다. 유효기간은 30일입니다.</p><button disabled={busy}>{local ? '테스트 지갑으로 조건 승인·판매' : '지갑으로 조건 승인·판매'}</button></form>;
}
