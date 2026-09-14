import manifest from '../../private/free-packages/manifest.json';
import type { Asset, CatalogItem, Report, Version } from './model';

const operator = '00000000-0000-4000-8000-000000000001';
const titles: Record<string, { summary: string; purpose: string; tools: string[]; contents: string[] }> = {
  'design-starter': { summary: '화면을 만들기 전 필요한 정보와 시각 방향을 정리하는 두 가지 디자인 스킬.', purpose: '화면 디자인', tools: ['Codex', 'Claude Code', 'Python'], contents: ['frontend-design', 'ui-ux-pro-max'] },
  'landing-page': { summary: '제품 소개 화면을 만들고 검색 노출과 주요 동작을 확인하는 세 가지 스킬.', purpose: '랜딩페이지', tools: ['Codex', 'Claude Code', 'Python'], contents: ['frontend-design', 'seo-audit', 'webapp-testing'] },
  dashboard: { summary: '지표를 읽기 쉽게 배치하고 차트·표·필터 동작을 확인하는 두 가지 스킬.', purpose: '대시보드', tools: ['Codex', 'Claude Code', 'Python'], contents: ['ui-ux-pro-max', 'webapp-testing'] },
  portfolio: { summary: '작품을 보여줄 분위기를 고르고 작은 화면과 링크를 점검하는 세 가지 스킬.', purpose: '포트폴리오', tools: ['Codex', 'Claude Code', 'Python'], contents: ['theme-factory', 'frontend-design', 'webapp-testing'] },
};

export const freePackages = manifest.map((entry): CatalogItem => {
  const info = titles[entry.key];
  const versionId = entry.id.replace(/^2/, '3');
  const asset: Asset = { id: entry.id, ownerId: operator, title: entry.title, summary: info.summary, kind: 'skill', createdAt: '2026-09-13T00:00:00.000Z', purpose: info.purpose,
    supportedTools: info.tools, coverPath: `/covers/${entry.key}.svg`, contents: info.contents, prerequisites: '프로젝트에 Codex 또는 Claude Code가 필요합니다. 일부 검색·검증 스크립트는 Python 3 또는 브라우저가 필요합니다.',
    installation: 'ZIP의 README.ko.md에서 사용하는 도구의 프로젝트 설치 경로를 확인하세요. 기존 폴더는 비교한 뒤 합치세요.', usageTerms: '원작자의 개별 라이선스를 따릅니다. ZIP 안의 LICENSE.original.txt와 SOURCES.json을 확인하세요.', sellerName: 'AI 에셋마켓 운영팀', freePackage: true };
  const version: Version = { id: versionId, assetId: asset.id, ownerId: operator, version: '1.0.0', fileName: entry.fileName, fileHash: `0x${entry.sha256}`, storagePath: `free-packages/${entry.fileName}`,
    capabilities: [], input: 'text', output: 'text', environment: 'Codex·Claude Code 프로젝트 설치 / Python 3 일부 스크립트', license: asset.usageTerms!, licenseHash: `0x${entry.sha256}`,
    limitations: ['AI 작업 성능과 스킬 조합 효과는 미평가입니다.', '모델·도구별 실행 호환성은 설치 구조와 파일 확인 범위 외에는 미평가입니다.'], state: 'listed', createdAt: asset.createdAt, freePackage: true, packageKey: entry.key, contentFormat: 'agent-skill' };
  const report: Report = { id: entry.id.replace(/^2/, '4'), versionIds: [versionId], fileHashes: [version.fileHash], kind: 'single', environment: '원본 커밋 고정·ZIP 파일 검사', evaluator: 'AI 에셋마켓 운영팀', rulesVersion: 'free-package-manifest/1', createdAt: asset.createdAt,
    accuracy: { task: 'AI 작업 성능과 조합 효과는 미평가', cases: [], passed: 0, total: 0 }, security: { findings: [], scanned: ['구성 파일 및 SHA-256 기록', '원본 커밋과 라이선스 원문 포함', 'ZIP 압축 구조 검사'], untested: ['모델 실행 결과', '스킬 조합 효과', '모든 도구 버전에서의 실행'], knownMisses: [] },
    limitations: version.limitations, durationMs: 0, inferenceCost: null, eligible: true, reportHash: `0x${entry.sha256}` };
  return { asset, version, report };
});

export function freePackageByVersion(id: string) { return freePackages.find(item => item.version.id === id); }
export function freePackageByAsset(id: string) { return freePackages.find(item => item.asset.id === id); }
