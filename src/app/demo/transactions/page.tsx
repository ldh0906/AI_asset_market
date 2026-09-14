import { TransactionDemo } from '../../../components/transaction-demo';

export const metadata = { title: '거래 안전성 데모 | AI 에셋마켓', robots: { index: false, follow: false } };

export default function TransactionDemoPage() {
  return <>
    <header className="header"><a className="brand" href="/demo">AI 에셋마켓 · 데모</a><nav aria-label="데모 메뉴"><a href="/demo">둘러보기</a><a href="/demo/transactions" aria-current="page">거래 안전성</a></nav><div className="account"><a href="/">실제 사이트로 돌아가기</a></div></header>
    <main className="main demo-main"><TransactionDemo /></main>
    <footer>이 페이지의 거래 결과는 브라우저 안에서 계산하며, 실제 체인 기록이나 구매 권한을 만들지 않습니다.</footer>
  </>;
}
