// These scenarios are presentation-only examples. No model or security test produced these results.
export type DemoExample = {
  lead: string;
  task: string;
  steps: string[];
  cases: { name: string; passed: boolean; detail: string }[];
  environment: string;
};

export const demoExamples: Record<string, DemoExample> = {
  'design-starter': {
    lead: '가상의 작은 서비스 화면을 만든다고 가정하고, 요구사항에서 시각 방향까지 이어지는 과정을 보여줍니다.',
    task: '예시 과제: 동네 클래스 예약 화면의 디자인 방향 정리',
    steps: ['대상 사용자와 핵심 행동을 한 문장으로 정리', '색상·글꼴·간격 후보를 비교', '첫 화면의 정보 순서를 제안'],
    cases: [
      { name: '사용자 목표 정리', passed: true, detail: '예약 완료까지 필요한 행동을 예시 답안에 포함' },
      { name: '색상 역할 구분', passed: true, detail: '본문·강조·보조색의 역할을 나눔' },
      { name: '모바일 정보 순서', passed: true, detail: '작은 화면에서 핵심 행동을 먼저 배치' },
      { name: '실제 사용자 검증', passed: false, detail: '인터뷰와 사용성 시험은 가정하지 않음' },
    ], environment: '가상 서비스 기획서와 화면 요구사항',
  },
  'landing-page': {
    lead: '가상의 제품 소개를 바탕으로 첫 화면의 메시지와 검색 노출 점검 순서를 보여줍니다.',
    task: '예시 과제: 온라인 독서 모임 소개 페이지 구성',
    steps: ['한 문장의 핵심 메시지 작성', '가입으로 이어지는 화면 구조 배치', '검색·모바일 점검 항목 정리'],
    cases: [
      { name: '핵심 메시지', passed: true, detail: '대상과 제공 가치를 예시 문구로 표현' },
      { name: '주요 행동 배치', passed: true, detail: '가입 버튼의 위치를 제안' },
      { name: '실제 검색 노출', passed: false, detail: '검색 엔진 색인과 순위는 시험하지 않음' },
    ], environment: '가상의 제품 설명과 모바일 화면 조건',
  },
  dashboard: {
    lead: '팀의 주간 지표를 보는 가상 화면을 예로 들어, 표·차트·필터의 배치를 보여줍니다.',
    task: '예시 과제: 주간 예약 현황 대시보드 설계',
    steps: ['핵심 지표와 단위 정의', '비교용 차트와 세부 표 배치', '기간 필터와 빈 데이터 상태 설명'],
    cases: [
      { name: '지표 단위 표시', passed: true, detail: '건수와 비율을 구분해 표기' },
      { name: '차트와 표 연결', passed: true, detail: '요약과 세부 데이터를 함께 배치' },
      { name: '빈 결과 안내', passed: true, detail: '필터 결과가 없을 때 안내 문구 포함' },
      { name: '실제 데이터 정확성', passed: false, detail: '운영 데이터와 대조하지 않음' },
    ], environment: '가상의 주간 예약 지표',
  },
  portfolio: {
    lead: '가상의 창작자 포트폴리오를 예로 들어, 작품과 연락 방법을 보여주는 순서를 구성합니다.',
    task: '예시 과제: 사진 작가 포트폴리오 화면 구성',
    steps: ['대표 작품 선정', '작품 설명과 작업 과정 배치', '모바일 보기와 연락 링크 점검 항목 정리'],
    cases: [
      { name: '작품 설명', passed: true, detail: '목적과 역할을 소개하는 예시 문구 포함' },
      { name: '연락 경로', passed: true, detail: '눈에 띄는 연락 링크 위치 제안' },
      { name: '실제 링크 동작', passed: false, detail: '외부 계정과 사이트 링크는 열어보지 않음' },
    ], environment: '가상의 작품 목록과 작가 소개',
  },
  review: {
    lead: '가상의 코드 조각에서 지정된 위험 패턴을 찾아 JSON 결과로 정리하는 모습을 보여줍니다.',
    task: '예시 과제: 코드 조각의 위험 패턴 찾기',
    steps: ['입력 코드 확인', '지정 패턴과 일치하는 줄 표시', '발견 항목과 미탐지 범위를 분리'],
    cases: [
      { name: '직접 eval 호출', passed: true, detail: '예시 코드의 직접 호출을 발견했다고 가정' },
      { name: '문자열 비밀값', passed: true, detail: '예시 비밀값 패턴을 발견했다고 가정' },
      { name: 'innerHTML 대입', passed: true, detail: '예시 대입 구문을 발견했다고 가정' },
      { name: '우회 표현', passed: false, detail: '별칭·난독화는 이 예시의 탐지 범위 밖' },
    ], environment: '가상 JavaScript 코드 1개',
  },
  report: {
    lead: '입력 JSON에 이미 담긴 점검 결과를 읽기 쉬운 마크다운 보고서로 옮기는 모습을 보여줍니다.',
    task: '예시 과제: 점검 JSON을 한 페이지 보고서로 정리',
    steps: ['입력 항목과 숫자 확인', '제목·요약·세부 항목 배치', '입력에 없는 분석은 추가하지 않음'],
    cases: [
      { name: '제목과 요약', passed: true, detail: '예시 보고서 첫 부분에 포함' },
      { name: '입력 수치 보존', passed: true, detail: '가상 입력값을 그대로 옮긴다고 가정' },
      { name: '독립적 사실 검증', passed: false, detail: '입력 데이터의 진위는 확인하지 않음' },
    ], environment: '가상 점검 결과 JSON 1개',
  },
  complete: {
    lead: '코드 점검 결과를 보고서까지 이어 붙인 단일 상품의 사용 흐름을 보여줍니다.',
    task: '예시 과제: 위험 패턴 점검 후 마크다운 보고서 작성',
    steps: ['코드의 지정 패턴 점검', '결과 JSON의 항목 확인', '요약 보고서 생성'],
    cases: [
      { name: '점검 결과 전달', passed: true, detail: '예시 JSON 구조를 보고서 입력에 연결' },
      { name: '요약 형식', passed: true, detail: '제목과 발견 항목을 나눠 표기' },
      { name: '금액 비교', passed: true, detail: '가상 가격 150 TEST와 두 상품 합계 200 TEST 비교' },
      { name: '실제 업무 성능', passed: false, detail: '모델 호출과 실무 자료 시험은 미실행' },
    ], environment: '가상 JavaScript 코드와 가상 점검 JSON',
  },
};
