import { useState } from 'react';
import type { Capability, CatalogItem, Format, Recommendation as Result } from '../domain/model';
import { ENVIRONMENT, capabilities, capabilityLabels } from '../domain/model';
import { api } from '../client/api';
import { ReportView } from './report-view';
const formats: Format[] = ['code', 'csv', 'json', 'markdown', 'text'];
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
export function Recommendation({ items, busy, run, onBuy, aiConfigured, onModelTest }: { items: CatalogItem[]; busy: boolean; run: Run; onBuy: (ids: string[]) => void; aiConfigured: boolean; onModelTest: (ids: string[]) => void }) {
  const [goal, setGoal] = useState('내 코드의 위험 패턴을 점검하고 보고서를 만들고 싶어요.');
  const [needed, setNeeded] = useState<Capability[]>(['code-review', 'report']);
  const [input, setInput] = useState<Format>('code'), [output, setOutput] = useState<Format>('markdown');
  const [budget, setBudget] = useState('200'), [result, setResult] = useState<Result | null>(null), [combination, setCombination] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [requestedEnvironment, setRequestedEnvironment] = useState<string | null>(null), [acceptEnvironment, setAcceptEnvironment] = useState(true);
  return <section><h1>작업에 필요한 구성 찾기</h1><p className="muted">입력한 조건을 충족하는 단품과 시험된 조합 중 가장 낮은 가격의 구성을 찾습니다.</p>
    <form className="panel form-grid" onSubmit={e => { e.preventDefault(); if (!acceptEnvironment) return; void run(async () => setResult(await api('recommend', { goal, capabilities: needed, input, output, budget, environment: ENVIRONMENT }))); }}>
      <label className="span-2">해결하려는 작업<textarea value={goal} onChange={e => setGoal(e.target.value)} required minLength={3} maxLength={1000} /></label>
      <div className="span-2"><button type="button" className="secondary" disabled={busy || !aiConfigured} onClick={() => void run(async () => {
        const extracted = await api('intent', { goal }); setNeeded(extracted.capabilities); if (extracted.input) setInput(extracted.input); if (extracted.output) setOutput(extracted.output); if (extracted.budget !== null) setBudget(extracted.budget); setQuestions(extracted.questions); setRequestedEnvironment(extracted.environment); setAcceptEnvironment(!extracted.environment || extracted.environment === ENVIRONMENT); setResult(null);
      }, 'AI가 정리한 조건을 확인하고 수정한 뒤 추천을 실행하세요.')}>AI로 요구조건 정리</button>{!aiConfigured && <p className="small muted">AI 연결 전에는 아래 조건을 직접 선택하세요.</p>}{questions.length > 0 && <ul>{questions.map(q => <li key={q}>{q}</li>)}</ul>}</div>
      <fieldset className="span-2"><legend>필요한 기능</legend><div className="checks">{capabilities.map(c => <label key={c}><input type="checkbox" checked={needed.includes(c)} onChange={e => setNeeded(e.target.checked ? [...needed, c] : needed.filter(x => x !== c))} />{capabilityLabels[c]}</label>)}</div></fieldset>
      <label>입력 형식<select value={input} onChange={e => setInput(e.target.value as Format)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label>
      <label>원하는 출력<select value={output} onChange={e => setOutput(e.target.value as Format)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label>
      <label>최대 상품 예산 TEST<input type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)} required /></label>
      <label>지원 환경<input readOnly value={ENVIRONMENT} /></label>
      {requestedEnvironment && requestedEnvironment !== ENVIRONMENT && <div className="span-2 notice"><p>요청한 환경 {requestedEnvironment}의 호환성은 시험하지 않았습니다.</p><label className="check"><input type="checkbox" checked={acceptEnvironment} onChange={e => setAcceptEnvironment(e.target.checked)} />{ENVIRONMENT} 환경으로 요청을 변경합니다.</label></div>}
      <div className="span-2"><button disabled={busy || !needed.length || !acceptEnvironment}>구성 추천</button><p className="muted small">최종 선택한 요구조건으로 비용을 비교합니다. 기본 AI 대비 성능 개선은 별도 측정 전까지 주장하지 않습니다.</p></div>
    </form>
    {result && <article className="panel"><h2>{result.status === 'matched' ? result.items.length === 1 ? '단품으로 충분합니다' : '시험된 조합을 찾았습니다' : '조건에 맞는 구성이 없습니다'}</h2>
      <ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
      {result.items.length > 0 && <><ol>{result.items.map(i => <li key={i.version.id}>{i.asset.title} v{i.version.version}</li>)}</ol>
        <p><strong>{result.total} TEST</strong> · 할인 {result.discount} TEST · 네트워크 비용 별도</p>
        <button disabled={busy} onClick={() => onBuy(result.items.map(i => i.version.id))}>추천 구성 구매 조건 확인</button>
        {result.report && <ReportView report={result.report} />}</>}
    </article>}
    <details className="panel"><summary>새 조합 시험</summary><p>워크플로는 선택 순서대로 데이터를 전달하며 문서는 모델의 참조 자료로 제공합니다. 서로 다른 이용 조건이나 지원하지 않는 연결은 거절됩니다.</p>
      <div className="checks vertical">{items.filter(i => !i.version.freePackage).map(i => <label key={i.version.id}><input type="checkbox" checked={combination.includes(i.version.id)} disabled={!combination.includes(i.version.id) && combination.length >= 3}
        onChange={e => setCombination(e.target.checked ? [...combination, i.version.id] : combination.filter(id => id !== i.version.id))} />{i.asset.title} ({i.version.input} → {i.version.output})</label>)}</div>
      <ol>{combination.map(id => <li key={id}>{items.find(i => i.version.id === id)?.asset.title}</li>)}</ol>
      <button disabled={busy || combination.length < 2} onClick={() => void run(() => api('evaluate', { versionIds: combination }), '조합 시험 결과를 저장했습니다. 다시 추천하면 이 조합도 비교합니다.')}>선택한 순서로 조합 시험</button>
      <button className="secondary" disabled={busy || !aiConfigured || combination.length < 2} onClick={() => onModelTest(combination)}>모델 비교 시험 준비</button>
    </details>
  </section>;
}
