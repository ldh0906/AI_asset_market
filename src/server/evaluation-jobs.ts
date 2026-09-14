import 'server-only';
import { z } from 'zod';
import { all, get, put, replaceRevision } from './database';
import { loadFile } from './storage';
import { hashBytes, hashObject } from '../domain/hash';
import type { Asset, Offer, Report, Version } from '../domain/model';
import { ENVIRONMENT } from '../domain/model';
import { casesFor, formatOf, planTrials, runTrial, summarize, variantsFor, type EvaluationAsset, type Pricing, type Trial, type Variant } from '../ai/evaluation';
import { scan } from '../../evaluator/engine.mjs';
import { modelConfigured, openAIProvider } from './model-provider';
import { required } from './config';
import { attest } from './chain';
import { quote } from '../domain/pricing';
import { securityBenchmark, blockingFindings } from '../../evaluator/security-benchmark.mjs';

export interface EvaluationJob {
  id: string; ownerId: string; revision: number; reportId: string; createdAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  versions: Version[]; titles: string[]; variants: Variant[]; model: string; resolvedModel?: string;
  repeats: number; caseNames: string[]; trials: Trial[]; totalTrials: number;
  leaseUntil?: string; error?: string; pricing: Pricing | null;
}
function publicJob(job: EvaluationJob) {
  return { id: job.id, versionIds: job.versions.map(v => v.id), titles: job.titles, status: job.status, model: job.resolvedModel ?? job.model,
    completedTrials: job.trials.length, totalTrials: job.totalTrials, repeats: job.repeats, caseNames: job.caseNames, error: job.error,
    reportId: job.status === 'completed' ? job.reportId : null, createdAt: job.createdAt, maxModelRequests: job.totalTrials * 4 };
}
export async function listJobs(userId: string) { return (await all<EvaluationJob>('evaluation_jobs')).filter(j => j.ownerId === userId).map(publicJob); }
async function jobFor(userId: string, id: string) {
  const job = await get<EvaluationJob>('evaluation_jobs', z.uuid().parse(id));
  if (!job || job.ownerId !== userId) throw new Error('본인의 모델 시험만 실행할 수 있습니다.');
  return job;
}
async function loadAssets(versions: Version[], titles: string[]): Promise<EvaluationAsset[]> {
  return Promise.all(versions.map(async (version, i) => {
    const current = await get<Version>('versions', version.id);
    if (!current || current.fileHash !== version.fileHash || current.state !== version.state || current.reportId !== version.reportId) throw new Error('시험 중 상품의 판매·검증 상태가 바뀌었습니다. 새 상태로 시험을 시작하세요.');
    const bytes = await loadFile(version.storagePath);
    if (hashBytes(bytes) !== version.fileHash) throw new Error('시험 파일이 등록한 해시와 다릅니다.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.length > 50000) throw new Error('현재 모델 시험은 상품당 50,000자 이하를 지원합니다.');
    return { version, text, title: titles[i], productPrice: null };
  }));
}
function configuredPricing(): Pricing | null {
  const raw = [process.env.MODEL_INPUT_USD_PER_MILLION, process.env.MODEL_CACHED_INPUT_USD_PER_MILLION, process.env.MODEL_OUTPUT_USD_PER_MILLION];
  if (raw.some(v => !v) || !process.env.MODEL_PRICING_SOURCE) return null;
  const [input, cachedInput, output] = raw.map(Number);
  if ([input, cachedInput, output].some(v => !Number.isFinite(v) || v < 0)) throw new Error('모델 비용 단가 설정이 올바르지 않습니다.');
  return { input, cachedInput, output, source: process.env.MODEL_PRICING_SOURCE };
}
export async function createJob(userId: string, ids: string[]) {
  z.array(z.uuid()).min(1).max(3).parse(ids);
  if (new Set(ids).size !== ids.length) throw new Error('중복된 시험 대상입니다.');
  if (!modelConfigured()) throw new Error('AI 모델 연결 후 비교 시험을 시작할 수 있습니다.');
  const existing = (await all<EvaluationJob>('evaluation_jobs')).find(j => j.ownerId === userId && ['pending', 'running'].includes(j.status));
  if (existing) throw new Error('진행 중인 모델 시험을 이어서 실행하거나 취소하세요.');
  const versions = await Promise.all(ids.map(async id => {
    const v = await get<Version>('versions', id);
    if (!v || (v.ownerId !== userId && v.state !== 'listed')) throw new Error('시험할 수 없는 상품입니다.');
    if (ids.length === 1 && v.ownerId !== userId) throw new Error('단품의 검증 기록은 판매자가 갱신할 수 있습니다.');
    if (ids.length === 1 && v.state === 'listed') throw new Error('판매를 중지한 뒤 새 시험을 실행하세요.');
    if (ids.length > 1) {
      const report = v.reportId ? await get<Report>('reports', v.reportId) : undefined;
      if (!report?.eligible || report.revokedAt) throw new Error('구성품 각각의 단품 시험을 먼저 완료하세요.');
    }
    return v;
  }));
  if (!versions.every(v => v.licenseHash === versions[0].licenseHash)) throw new Error('이용 조건이 다른 조합은 별도 검토가 필요합니다.');
  const titles = await Promise.all(versions.map(async v => (await get<Asset>('assets', v.assetId))?.title ?? v.fileName));
  const assets = await loadAssets(versions, titles), offers = await all<Offer>('offers');
  const reports = await all<Report>('reports');
  const currentOffers = versions.map(v => v.state === 'listed' ? offers.find(o => o.versionId === v.id && o.terms.fileHash === v.fileHash && o.terms.reportHash === reports.find(r => r.id === v.reportId)?.reportHash && !o.cancelledAt && Number(o.terms.validUntil) * 1000 > Date.now()) : undefined);
  assets.forEach((a, i) => { const offer = currentOffers[i]; if (offer) a.productPrice = (BigInt(offer.terms.sellerAmount) + BigInt(offer.terms.platformFee)).toString(); });
  const setPrice = currentOffers.every((o): o is Offer => !!o) ? quote(currentOffers.map(o => o.terms), currentOffers.map(o => o.terms.maxDiscount)).total : null;
  const cases = casesFor(assets), variants = variantsFor(assets, setPrice), repeats = 2;
  const job: EvaluationJob = { id: crypto.randomUUID(), ownerId: userId, revision: 0, reportId: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending', versions, titles,
    variants, model: required('OPENAI_MODEL'), repeats, caseNames: cases.map(c => c.name), trials: [], totalTrials: planTrials(variants, cases, repeats).length, pricing: configuredPricing() };
  await put('evaluation_jobs', job);
  return publicJob(job);
}
async function finish(job: EvaluationJob, assets: EvaluationAsset[]) {
  const cases = casesFor(assets);
  const comparison = summarize(job.id, assets, job.variants, cases, job.trials, job.repeats, job.pricing);
  const targetIndex = job.versions.length === 1 ? 1 : job.variants.length - 1;
  const rows = job.trials.filter(t => t.variant === targetIndex), target = comparison.comparisons[targetIndex];
  const scans = assets.map(a => scan(a.text, formatOf(a.version) === 'workflow' ? 'skill' : 'document'));
  const security = Object.fromEntries(['findings', 'scanned', 'untested', 'knownMisses'].map(key => [key, [...new Set(scans.flatMap(s => s[key as keyof typeof s]))]])) as unknown as Report['security'];
  security.benchmark = securityBenchmark();
  const base: Omit<Report, 'reportHash'> = { id: job.reportId, versionIds: job.versions.map(v => v.id), fileHashes: job.versions.map(v => v.fileHash), kind: job.versions.length === 1 ? 'single' : 'combination',
    environment: ENVIRONMENT, evaluator: '플랫폼 모델·도구 시험기', rulesVersion: comparison.suiteVersion, createdAt: job.createdAt,
    accuracy: { task: '동일 모델·입력·판정 규칙의 실제 업무 과제', passed: target.passed, total: target.total,
      cases: rows.map(r => ({ name: `${cases[r.caseIndex].name} · 반복 ${r.repeat + 1}`, passed: r.passed, detail: `${r.detail} 출력 해시: ${r.outputHash}` })) },
    security, durationMs: rows.reduce((s, r) => s + r.durationMs, 0), inferenceCost: target.estimatedCostUsd,
    limitations: [...new Set(job.versions.flatMap(v => v.limitations)), '공개된 고정 과제의 소규모 반복 시험이며 범용 성능 또는 통계적 우위를 보장하지 않습니다.',
      '문서 시험은 원문 근거 확인이며 전문 지식의 사실성·저작권 검토를 대신하지 않습니다.', '모델 출력 원문에는 유료 자산이 포함될 수 있어 공개 보고서에는 판정과 출력 해시만 보관합니다.',
      ...(job.pricing ? ['추론 비용은 기록한 토큰과 설정한 단가로 계산한 추정치입니다.'] : ['모델 단가가 설정되지 않아 추론 비용은 미산정입니다. 토큰 사용량은 실제 응답 값입니다.'])],
    modelEvaluation: comparison, eligible: rows.length > 0 && rows.every(r => r.passed) && blockingFindings(security.findings).length === 0 };
  const report: Report = { ...base, reportHash: hashObject(base) };
  if (job.versions.length === 1) {
    const version = job.versions[0];
    if (report.eligible) report.attestationTx = await attest(version, report.reportHash, true);
    else if (version.reportId) {
      const old = await get<Report>('reports', version.reportId);
      if (old?.attestationTx) await attest(version, old.reportHash, false);
    }
    await put('reports', report, false, job.ownerId);
    await put('versions', { ...version, reportId: report.id, state: 'review' }, false);
  } else await put('reports', report, true, job.ownerId);
}
export async function stepJob(userId: string, id: string) {
  const original = await jobFor(userId, id);
  if (original.status === 'running') {
    if (Date.parse(original.leaseUntil ?? '') > Date.now()) return publicJob(original);
    const failed: EvaluationJob = { ...original, revision: original.revision + 1, status: 'failed', error: '이전 실행의 완료를 확인하지 못했습니다. 그 호출의 비용은 확인되지 않았으며 이 시험은 성적으로 공개하지 않습니다.' };
    await replaceRevision('evaluation_jobs', failed, userId, original.revision); return publicJob(await jobFor(userId, id));
  }
  if (original.status !== 'pending') return publicJob(original);
  let job: EvaluationJob = { ...original, revision: original.revision + 1, status: 'running', leaseUntil: new Date(Date.now() + 90000).toISOString(), error: undefined };
  if (!await replaceRevision('evaluation_jobs', job, userId, original.revision)) return publicJob(await jobFor(userId, id));
  try {
    const assets = await loadAssets(job.versions, job.titles), cases = casesFor(assets), plan = planTrials(job.variants, cases, job.repeats);
    const next = plan[job.trials.length];
    if (next) {
      const variant = job.variants[next.variant];
      const trial = await runTrial(openAIProvider(), job.resolvedModel ?? job.model, variant.indices.map(i => assets[i]), cases[next.caseIndex], next.variant, next.caseIndex, next.repeat);
      if (job.resolvedModel && trial.model !== job.resolvedModel) throw new Error('시험 모델 버전이 변경되었습니다.');
      job = { ...job, resolvedModel: trial.model, trials: [...job.trials, trial] };
    }
    const current = await jobFor(userId, id);
    if (current.revision !== job.revision || current.status !== 'running' || Date.parse(job.leaseUntil!) <= Date.now()) throw new Error('시험 실행 권한이 만료되었습니다.');
    if (job.trials.length === plan.length) { await loadAssets(job.versions, job.titles); await finish(job, assets); job.status = 'completed'; }
    else job.status = 'pending';
  } catch (error) { job.status = 'failed'; job.error = `${error instanceof Error ? error.message : '모델 시험 실패'} 실패한 호출의 비용이 확인되지 않아 이 시험은 공개 성적에서 제외됩니다.`; }
  job.revision++;
  if (!await replaceRevision('evaluation_jobs', job, userId, original.revision + 1)) throw new Error('시험 실행 상태가 변경되어 결과를 저장하지 못했습니다.');
  return publicJob(job);
}
export async function cancelJob(userId: string, id: string) {
  const job = await jobFor(userId, id);
  if (job.status === 'running') throw new Error('진행 중인 한 과제가 끝난 뒤 취소할 수 있습니다.');
  if (job.status === 'pending') await replaceRevision('evaluation_jobs', { ...job, status: 'cancelled', revision: job.revision + 1 }, userId, job.revision);
  return publicJob(await jobFor(userId, id));
}
