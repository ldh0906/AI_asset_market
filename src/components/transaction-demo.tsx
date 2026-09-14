'use client';

import { useReducer, useRef, useState } from 'react';
import {
  changedDemoFile, checkDemoDownload, combinationAvailable, demoTerms,
  initialTransactionDemoState, purchaseDemoSet, stopDemoReviewSale,
  type TransactionDemoState,
} from '../domain/transaction-demo';

type HashCheck = Awaited<ReturnType<typeof checkDemoDownload>>;
type View = {
  machine: TransactionDemoState;
  normal: boolean;
  duplicate: boolean;
  hash: HashCheck | null;
  limit: boolean;
  stopped: boolean;
};
type Action = { type: 'normal' | 'duplicate' | 'limit' | 'stop' | 'reset' } | { type: 'hash'; result: HashCheck };

function initialView(): View {
  return { machine: initialTransactionDemoState(), normal: false, duplicate: false, hash: null, limit: false, stopped: false };
}

function reduce(view: View, action: Action): View {
  if (action.type === 'reset') return initialView();
  if (action.type === 'normal') {
    const result = purchaseDemoSet(view.machine, 'demo-order-1', [5, 5]);
    return { ...view, machine: result.state, normal: result.status === 'success' };
  }
  if (action.type === 'duplicate') {
    const result = purchaseDemoSet(view.machine, 'demo-order-1', [5, 5]);
    return { ...view, machine: result.state, duplicate: result.reason === 'InvalidOrder' };
  }
  if (action.type === 'limit') {
    const result = purchaseDemoSet(view.machine, 'demo-over-limit', [6, 5]);
    return { ...view, machine: result.state, limit: result.reason === 'InvalidDiscount' };
  }
  if (action.type === 'stop') return { ...view, machine: stopDemoReviewSale(view.machine), stopped: true };
  if (action.type === 'hash') return { ...view, hash: action.result };
  return view;
}

export function TransactionDemo() {
  const [view, dispatch] = useReducer(reduce, undefined, initialView);
  const [checking, setChecking] = useState(false);
  const hashRequest = useRef(0);
  const { machine } = view;
  const available = combinationAvailable(machine);
  const total = Object.values(machine.ledger).reduce((sum, amount) => sum + amount, 0);

  async function checkChangedFile() {
    if (!machine.owned || checking) return;
    const request = ++hashRequest.current;
    setChecking(true);
    try {
      const result = await checkDemoDownload(machine, changedDemoFile);
      if (request === hashRequest.current) dispatch({ type: 'hash', result });
    } finally { if (request === hashRequest.current) setChecking(false); }
  }

  return <section className="transaction-demo" aria-labelledby="transaction-demo-title">
    <div className="transaction-intro"><div><span className="tag sage">브라우저 데모</span><h1 id="transaction-demo-title">거래 규칙을 직접 확인하세요</h1><p>정상 구매부터 세 가지 거절 상황까지 순서대로 실행할 수 있습니다. 각 버튼은 잔액, 구매 권한, 추천 가능 여부를 즉시 갱신합니다.</p></div>
      <div className="transaction-disclaimer" role="note"><strong>체인 거래 아님</strong><p>이 화면은 공개 테스트넷에 연결하지 않습니다. TEST 금액과 영수증은 브라우저 메모리의 예시이며 새로고침하면 초기화됩니다. 해시 검사에는 실제 SHA-256 계산을 사용합니다.</p></div></div>

    <div className="transaction-ledger" aria-label="데모 잔액"><div><span>구매자</span><strong>{machine.ledger.buyer} <small>TEST</small></strong></div><div><span>판매자 1</span><strong>{machine.ledger.sellerOne} <small>TEST</small></strong></div><div><span>판매자 2</span><strong>{machine.ledger.sellerTwo} <small>TEST</small></strong></div><div><span>플랫폼</span><strong>{machine.ledger.platform} <small>TEST</small></strong></div></div>
    <div className="transaction-state-line"><span>합계 {total} TEST</span><span>구매 권한 {machine.owned ? '2개 발급' : '없음'}</span><span>시험된 조합 {available ? '추천 가능' : '신규 추천 제외'}</span></div>

    <div className="transaction-grid">
      <article className="transaction-step"><div className="transaction-step-head"><span>01</span><span className="transaction-step-status">{view.normal ? '완료' : '대기'}</span></div><h2>정상 거래</h2><p>두 상품을 한 번에 구매합니다. 판매자 2명에게 각각 90 TEST, 플랫폼에 10 TEST를 분배하고 구매 권한 2개를 발급합니다.</p>
        <button disabled={view.normal || !available} onClick={() => dispatch({ type: 'normal' })}>190 TEST로 조합 구매</button>
        {view.normal && <div className="transaction-result success" role="status"><strong>구매·정산 완료</strong><span>구매자 −190 · 판매자 +90/+90 · 플랫폼 +10</span><span>예시 주문 ID: demo-order-1</span></div>}
        {view.normal && <button className="secondary transaction-secondary" disabled={view.duplicate} onClick={() => dispatch({ type: 'duplicate' })}>같은 주문 다시 실행</button>}
        {view.duplicate && <p className="transaction-small-result" role="status">InvalidOrder · 같은 주문은 다시 정산하지 않았습니다.</p>}
      </article>

      <article className="transaction-step"><div className="transaction-step-head"><span>02</span><span className="transaction-step-status">{view.hash ? '거절' : '대기'}</span></div><h2>해시 불일치</h2><p>구매 파일의 내용을 바꿔 다운로드를 시도합니다. 원본과 제공하려는 파일의 SHA-256을 직접 계산해 비교합니다.</p>
        <button disabled={!machine.owned || checking || !!view.hash} onClick={() => void checkChangedFile()}>{checking ? '해시 확인 중…' : '변조 파일 다운로드 시도'}</button>
        {!machine.owned && <p className="transaction-hint">먼저 정상 거래를 실행하세요.</p>}
        {view.hash && <div className="transaction-result rejected" role="status"><strong>{view.hash.allowed ? '제공 허용' : '파일 제공 차단'}</strong><span>원본 SHA-256: <code>{view.hash.expectedHash}</code></span><span>변조 SHA-256: <code>{view.hash.receivedHash}</code></span><span>두 값이 달라 파일을 제공하지 않았습니다.</span></div>}
      </article>

      <article className="transaction-step"><div className="transaction-step-head"><span>03</span><span className="transaction-step-status">{view.limit ? '거절' : '대기'}</span></div><h2>범위 초과</h2><p>판매자가 허용한 상품별 할인 한도는 {demoTerms.maxDiscount} TEST입니다. 첫 상품에 6 TEST 할인을 요청해 계약 규칙을 확인합니다.</p>
        <button disabled={view.limit} onClick={() => dispatch({ type: 'limit' })}>한도 초과 구매 시도</button>
        {view.limit && <div className="transaction-result rejected" role="status"><strong>InvalidDiscount · 거래 거절</strong><span>허용 {demoTerms.maxDiscount} TEST / 요청 6 TEST</span><span>잔액과 구매 권한은 변경되지 않았습니다.</span></div>}
      </article>

      <article className="transaction-step"><div className="transaction-step-head"><span>04</span><span className="transaction-step-status">{view.stopped ? '제외' : '대기'}</span></div><h2>조합 자동 무효화</h2><p>시험을 통과한 조합의 구성품 하나가 판매 중지되면, 조합도 신규 추천과 구매 대상에서 빠집니다.</p>
        <button disabled={!machine.owned || view.stopped} onClick={() => dispatch({ type: 'stop' })}>첫 상품 판매 중지</button>
        {!machine.owned && <p className="transaction-hint">정상 구매 후 기존 권한 유지 여부를 확인할 수 있습니다.</p>}
        {view.stopped && <div className="transaction-result rejected" role="status"><strong>조합 신규 추천 제외</strong><span>중지 전: 추천 가능 → 중지 후: 추천 불가</span><span>이미 발급된 구매 권한 {machine.owned ? '2개는 유지됩니다.' : '은 없습니다.'}</span></div>}
      </article>
    </div>
    <div className="transaction-reset"><button className="secondary" onClick={() => { hashRequest.current++; dispatch({ type: 'reset' }); setChecking(false); }}>초기 상태로 다시 시작</button><p>이 데모의 TEST에는 금전적 가치가 없으며, 실제 지갑·계정·상품 저장소를 사용하지 않습니다.</p></div>
  </section>;
}
