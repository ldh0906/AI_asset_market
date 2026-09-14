import 'server-only';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Report, Version } from '../domain/model';
import { ENVIRONMENT } from '../domain/model';
import { hashObject, hashBytes } from '../domain/hash';
import { loadFile } from './storage';
import { get, put } from './database';
import { attest } from './chain';
import { securityBenchmark, blockingFindings } from '../../evaluator/security-benchmark.mjs';

export async function evaluate(versions: Version[]): Promise<Report> {
  if (!versions.length || versions.length > 3) throw new Error('시험은 1~3개 상품으로 구성하세요.');
  if (versions.length > 1 && !versions.every(v => v.licenseHash === versions[0].licenseHash)) throw new Error('이용 조건이 다른 조합은 별도 검토가 필요합니다.');
  const texts = await Promise.all(versions.map(async v => {
    const bytes = await loadFile(v.storagePath); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (hashBytes(bytes) !== v.fileHash) throw new Error('저장된 파일이 등록한 해시와 다릅니다.'); return text;
  }));
  const kinds = versions.map(v => v.contentFormat ?? (v.fileName.endsWith('.json') ? 'workflow' : 'document'));
  const needsModel = kinds.includes('agent-skill') || (versions.length > 1 && kinds.includes('document'));
  if (versions.length > 1 && needsModel) throw new Error('이 구성은 아래 모델 비교 시험에서 실제 모델과 함께 시험하세요.');
  const run = await new Promise<{ result: { task: string; cases: Report['accuracy']['cases']; passed: number; total: number; durationMs: number } | null; security: Report['security'][] }>((resolve, reject) => {
    const worker = new Worker(path.resolve('evaluator/worker.mjs'), { workerData: { texts, kinds }, env: {}, resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('시험 제한 시간을 초과했습니다.')); }, 5000);
    worker.once('message', data => { clearTimeout(timer); void worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data); });
    worker.once('error', e => { clearTimeout(timer); reject(e); });
    worker.once('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new Error('시험 실행이 중단됐습니다.')); } });
  });
  const security = Object.fromEntries((['findings', 'scanned', 'untested', 'knownMisses'] as const).map(key => [key, [...new Set(run.security.flatMap(s => s[key]))]])) as unknown as Report['security'];
  security.benchmark = securityBenchmark();
  const accuracy = needsModel ? { task: 'SKILL.md 형식·범위 확인. 모델 업무 성능은 아직 미평가입니다.', cases: [], passed: 0, total: 0 } : run.result ? { task: run.result.task, cases: run.result.cases, passed: run.result.passed, total: run.result.total } : {
    task: '문서 파일 형식 검사. 내용의 정확성과 전문성은 미평가.',
    cases: [{ name: 'UTF-8 텍스트 읽기', passed: true, detail: '파일 원문을 정상적으로 읽었습니다.' }, { name: '본문 존재', passed: texts[0].trim().length >= 50, detail: '50자 이상의 본문 여부만 확인했습니다.' }],
    passed: texts[0].trim().length >= 50 ? 2 : 1, total: 2,
  };
  const base: Omit<Report, 'reportHash'> = {
    id: crypto.randomUUID(), versionIds: versions.map(v => v.id), fileHashes: versions.map(v => v.fileHash), kind: versions.length > 1 ? 'combination' : 'single',
    environment: ENVIRONMENT, evaluator: '플랫폼 지정 도구 시험기', rulesVersion: 'fixed-cases/1.0.0', createdAt: new Date().toISOString(),
    accuracy, security, limitations: [...new Set(versions.flatMap(v => v.limitations)),
      '고정된 예제와 규칙의 검사이며 범용 AI 성능 점수가 아닙니다.',
      ...(kinds.includes('document') ? ['문서의 사실성·전문성·모델 답변 개선 효과는 아직 평가하지 않았습니다.'] : []),
      '기본 AI·단품·세트의 모델 추론 비교는 아직 측정하지 않았습니다.'],
    durationMs: run.result?.durationMs ?? 0, inferenceCost: null,
    requiresModelEvaluation: needsModel,
    eligible: !needsModel && accuracy.total > 0 && accuracy.passed === accuracy.total && blockingFindings(security.findings).length === 0,
  };
  const report: Report = { ...base, reportHash: hashObject(base) };
  // The report hash is sealed before chain metadata is appended.
  if (versions.length === 1 && report.eligible) report.attestationTx = await attest(versions[0], report.reportHash, true);
  else if (versions.length === 1 && versions[0].reportId) {
    const previous = await get<Report>('reports', versions[0].reportId);
    if (previous?.attestationTx && !previous.revokedAt) await attest(versions[0], previous.reportHash, false);
  }
  return put('reports', report, false, versions[0].ownerId);
}
