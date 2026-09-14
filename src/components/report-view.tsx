import type { Report } from '../domain/model';
export function ReportView({ report }: { report: Report }) {
  return <section className="report">
    <h3>시험 성적</h3>
    <p>{report.accuracy.total > 0 ? <><strong>{report.accuracy.passed} / {report.accuracy.total}</strong> 항목 통과</> : <strong>업무 성능 미평가</strong>} · {report.accuracy.task}</p>
    {report.requiresModelEvaluation && <p className="notice">모델 비교 시험을 완료해야 판매할 수 있습니다.</p>}
    <dl className="facts"><div><dt>시험 환경</dt><dd>{report.environment}</dd></div><div><dt>평가 기준</dt><dd>{report.rulesVersion}</dd></div>
      <div><dt>검사자</dt><dd>{report.evaluator}</dd></div><div><dt>시험 일자</dt><dd>{new Date(report.createdAt).toLocaleString('ko-KR')}</dd></div>
      <div><dt>실행 시간</dt><dd>{report.durationMs.toFixed(2)} ms ({report.modelEvaluation ? '대상 구성의 전체 반복' : '도구 실행'})</dd></div><div><dt>모델 추론 비용</dt><dd>{report.inferenceCost === null ? '미산정' : `추정 $${report.inferenceCost.toFixed(6)}`}</dd></div></dl>
    {report.modelEvaluation && <><h4>같은 과제의 구성별 결과</h4><p>{report.modelEvaluation.model} · 각 과제 {report.modelEvaluation.repeats}회 · 총 {report.modelEvaluation.trialCount}개 결과</p>
      <div className="table-scroll"><table><thead><tr><th>구성</th><th>통과</th><th>상품 가격 TEST</th><th>평균 시간</th><th>입력 / 출력 토큰</th><th>추정 비용 USD</th></tr></thead><tbody>{report.modelEvaluation.comparisons.map((c, i) => <tr key={i}><td>{c.label}{i === report.modelEvaluation!.bestSingleIndex && ' (최고 단품)'}</td><td>{c.passed}/{c.total}</td><td>{c.productPrice ?? '판매 전'}</td><td>{(c.durationMs.mean / 1000).toFixed(2)}초</td><td>{c.usage.inputTokens} / {c.usage.outputTokens}<br /><small>입력 중 캐시 {c.usage.cachedInputTokens}</small></td><td>{c.estimatedCostUsd === null ? '단가 미설정' : `$${c.estimatedCostUsd.toFixed(6)}`}</td></tr>)}</tbody></table></div>
      <p className="small muted">가격은 시험 시작 시점입니다. 최고 단품은 같은 과제의 통과율, 동률이면 알려진 가격으로 정합니다. 세트의 우위는 이 소규모 시험만으로 일반화하지 않습니다.</p>
      <p>{report.modelEvaluation.grading}</p>{report.modelEvaluation.priceSource && <p className="small">단가 근거: {report.modelEvaluation.priceSource}</p>}</>}
    <details><summary>항목별 결과</summary><ul>{report.accuracy.cases.map(c => <li key={c.name}><strong>{c.passed ? '통과' : '실패'} — {c.name}</strong><p>{c.detail}</p></li>)}</ul></details>
    <details><summary>보안 검사 범위와 한계</summary>
      {report.security.benchmark ? <><h4>검사기 자체의 샘플 시험</h4><p>{report.security.benchmark.scope}</p>
        <dl className="facts"><div><dt>위험 탐지</dt><dd>{report.security.benchmark.truePositive} / {report.security.benchmark.truePositive + report.security.benchmark.falseNegative} ({(report.security.benchmark.detectionRate * 100).toFixed(1)}%)</dd></div>
          <div><dt>정상 오차단</dt><dd>{report.security.benchmark.falsePositive} / {report.security.benchmark.falsePositive + report.security.benchmark.trueNegative} ({(report.security.benchmark.falsePositiveRate * 100).toFixed(1)}%)</dd></div></dl>
        <details><summary>보안 샘플별 실제 판정</summary><p>샘플 버전: {report.security.benchmark.version}</p><ul>{report.security.benchmark.cases.map(c => <li key={c.name}>{c.name}: {c.expectedRisk ? '위험 샘플' : '정상 샘플'} → {c.detected ? '차단' : '통과'}{c.expectedRisk !== c.detected && (c.expectedRisk ? ' (미탐지)' : ' (오차단)')}</li>)}</ul></details></> : <p>이 보고서 작성 시점에는 검사기의 탐지율·오차단율을 측정하지 않았습니다.</p>}
      <h4>확인한 범위</h4><ul>{report.security.scanned.map(s => <li key={s}>{s}</li>)}</ul>
      <h4>탐지 항목</h4>{report.security.findings.length ? <ul>{report.security.findings.map(s => <li key={s}>{s}</li>)}</ul> : <p>검사한 패턴에서 탐지 없음. 안전 보증은 아닙니다.</p>}
      <h4>미검사</h4><ul>{report.security.untested.map(s => <li key={s}>{s}</li>)}</ul>
      <h4>알려진 미탐지</h4><ul>{report.security.knownMisses.map(s => <li key={s}>{s}</li>)}</ul>
    </details>
    <details><summary>알려진 한계·버전 근거</summary><ul>{report.limitations.map(s => <li key={s}>{s}</li>)}</ul>
      <p className="hash">보고서 SHA-256: {report.reportHash}</p>
      {report.fileHashes.map((h, i) => <p className="hash" key={`${i}-${h}`}>파일 {i + 1}: {h}</p>)}
      {report.attestationTx && <p className="hash">시험 등록 거래: {report.attestationTx}</p>}
    </details>
    {report.revokedAt && <p className="notice error">이 시험의 판매 승인이 취소되었습니다.</p>}
  </section>;
}
