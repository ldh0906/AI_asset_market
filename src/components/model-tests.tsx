import type { ModelJob, Report } from '../domain/model';
import { ReportView } from './report-view';

export function ModelTests({ jobs, reports, active, busy, configured, onResume, onPause, onCancel }: {
  jobs: ModelJob[]; reports: Report[]; active: string | null; busy: boolean; configured: boolean;
  onResume: (job: ModelJob) => void; onPause: () => void; onCancel: (id: string) => void;
}) {
  return <section className="panel"><h2>모델 비교 시험</h2>
    <p>기본 AI · 각 단품 · 전체 구성에 같은 과제를 두 번씩 실행합니다. 완료한 과제는 저장되며 다시 호출하지 않습니다.</p>
    {!configured && <p className="notice">AI 모델 연결 전입니다. 실제 모델 시험 성적은 아직 없습니다. 상품 등록과 지정 도구 시험은 사용할 수 있습니다.</p>}
    {!jobs.length && <p className="muted">상품 버전 또는 새 조합에서 모델 비교 시험을 만들 수 있습니다.</p>}
    {jobs.map(job => <article className="report" key={job.id}>
      <h3>{job.titles.join(' + ')}</h3><p>{job.model} · {{ pending: '대기', running: '과제 실행 중', completed: '완료', failed: '실패', cancelled: '취소' }[job.status]}</p>
      <label>과제 진행 {job.completedTrials} / {job.totalTrials}<progress value={job.completedTrials} max={job.totalTrials} /></label>
      <p className="small muted">전체 시험은 최대 {job.maxModelRequests}회 모델 호출을 사용합니다. 모델 사용료가 발생하며, 상품 구매 가격과 별도입니다.</p>
      <details><summary>같은 조건으로 비교하는 과제</summary><ul>{job.caseNames.map(name => <li key={name}>{name}</li>)}</ul></details>
      {job.error && <p role="alert" className="notice error">{job.error}</p>}
      <div className="toolbar">
        {active === job.id ? <button className="secondary" onClick={onPause}>현재 과제 후 일시 정지</button> : ['pending', 'running'].includes(job.status) && <button disabled={busy || !configured} onClick={() => onResume(job)}>{job.status === 'running' ? '실행 상태 확인·이어가기' : '남은 시험 실행'}</button>}
        {job.status === 'pending' && <button className="secondary" disabled={busy} onClick={() => onCancel(job.id)}>시험 취소</button>}
      </div>
      {job.reportId && reports.find(r => r.id === job.reportId) && <ReportView report={reports.find(r => r.id === job.reportId)!} />}
    </article>)}
  </section>;
}
