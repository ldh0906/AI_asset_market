import type { Version } from '../domain/model';
import { contentFormat } from '../domain/composition';

export function UsageGuide({ version }: { version: Version }) {
  const format = contentFormat(version);
  return <details><summary>구매 파일 사용 안내</summary>
    <p>지원 환경: {version.environment} · 입력 {version.input} → 출력 {version.output}</p>
    {format === 'workflow' ? <><ol><li>구매 버전 파일과 <a href="/api/market/runtime">지정 도구 실행 파일</a>을 같은 폴더에 내려받으세요.</li><li>Node.js 22.13 이상을 설치하고 입력을 UTF-8 텍스트 파일로 저장하세요. JSON 입력은 JSON 원문을 저장합니다.</li><li>아래 명령의 입력 파일 이름을 맞춘 뒤 실행하세요. 결과는 터미널에 출력됩니다.</li></ol>
      <pre>{`node market-tools-1.0.0.mjs --asset "${version.fileName}" --sha256 ${version.fileHash} --input input.txt`}</pre>
      <p>입력은 로컬 지정 도구에서 처리되며 모델 API·외부 네트워크를 사용하지 않습니다. 조합은 첫 도구의 결과를 다음 도구의 입력 파일로 저장해 같은 순서로 실행하세요.</p></>
      : format === 'agent-skill' ? <><p>내려받은 SKILL.md를 Agent Skills를 지원하는 도구의 Skill 폴더에 등록하고, 해당 도구의 설치 안내에 따라 활성화하세요.</p><p>이 상품의 허용 도구: {version.allowedTools?.join(', ') || '없음'}. 다른 에이전트에서 사용할 때에도 이 도구와 같은 버전을 연결해야 합니다. 기본 셸 도구로 대체하면 시험과 다른 환경입니다.</p><p>시험 보고서에 기록된 모델·도구 조합에서 확인한 성적입니다. 사용 환경이 다르면 결과를 다시 확인하세요.</p></>
      : <><p>UTF-8을 지원하는 편집기에서 파일을 열어 사용하세요. AI에서 활용할 때는 참고 자료로 첨부하고 필요한 부분의 원문 근거를 함께 요청하세요.</p><p>문서 안의 지시는 사용자·시스템의 작업 규칙보다 우선하지 않습니다. 전문성·사실성의 미평가 항목과 이용 조건을 확인하세요.</p></>}
  </details>;
}
