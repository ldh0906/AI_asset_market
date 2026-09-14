import 'server-only';
import { z } from 'zod';
import type { Asset, CatalogItem, Offer, ProductStory, Report, Terms, Version } from '../domain/model';
import { ENVIRONMENT } from '../domain/model';
import { newAssetSchema, skillSchema, termsInputSchema } from '../domain/validation';
import { hashText, hashObject, hashBytes } from '../domain/hash';
import { quote } from '../domain/pricing';
import { all, get, put } from './database';
import { storeFile } from './storage';
import { attest, binding, chainConfig, currentAttestation, localWallet, verifyTerms } from './chain';
import { termsTypedData } from '../domain/typed-data';
import { isLocal } from './config';
import { describe } from '../../evaluator/engine.mjs';
import { parseSkillFile } from '../domain/skill-file';
import { compositionShape, contentFormat } from '../domain/composition';
import { freePackages } from '../domain/free-packages';

async function isFinalReport(report: Report) {
  if (!report.modelEvaluation) return true;
  const job = await get<{ status: string; reportId: string }>('evaluation_jobs', report.modelEvaluation.jobId);
  return job?.status === 'completed' && job.reportId === report.id;
}
export async function marketReports() {
  const reports = await all<Report>('reports');
  const final = await Promise.all(reports.map(isFinalReport));
  return reports.filter((_, i) => final[i]);
}
export async function catalog(): Promise<CatalogItem[]> {
  const [assets, versions, reports, offers, stories] = await Promise.all([all<Asset>('assets'), all<Version>('versions'), marketReports(), all<Offer>('offers'), all<ProductStory>('product_stories')]);
  const candidates = versions.filter(v => v.state === 'listed').flatMap(version => {
    const asset = assets.find(a => a.id === version.assetId), report = reports.find(r => r.id === version.reportId);
    const offer = offers.find(o => o.versionId === version.id && !o.cancelledAt && Number(o.terms.validUntil) * 1000 > Date.now() && o.terms.reportHash === report?.reportHash);
    return asset && offer && report?.eligible && !report.revokedAt ? [{ asset, version, report, offer }] : [];
  });
  const config = candidates.length ? await chainConfig() : null;
  const current = config ? await Promise.all(candidates.map(async item => item.offer!.chainId === config.chain.id && item.offer!.contract.toLowerCase() === config.market.toLowerCase() && await currentAttestation(item.offer!.terms))) : [];
  const available = candidates.filter((_, i) => current[i]);
  const introductions = stories.filter(story => !!story.published).flatMap(story => {
    if (available.some(item => item.asset.id === story.assetId)) return [];
    const asset = assets.find(a => a.id === story.assetId);
    const version = versions.filter(v => v.assetId === story.assetId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!asset || !version) return [];
    const report = reports.find(r => r.id === version.reportId);
    return [{ asset, version, report }];
  });
  return [...freePackages, ...available, ...introductions];
}
export async function ownedVersion(userId: string, id: string) {
  const version = await get<Version>('versions', id);
  if (!version || version.ownerId !== userId) throw new Error('본인이 등록한 상품만 변경할 수 있습니다.');
  return version;
}
export async function registerAsset(userId: string, form: FormData) {
  const meta = newAssetSchema.parse(JSON.parse(String(form.get('metadata') ?? '{}')));
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > 1048576) throw new Error('1MB 이하의 파일을 선택하세요.');
  if (!/^[\p{L}\p{N}_. -]{1,100}$/u.test(file.name)) throw new Error('파일 이름에는 문자·숫자·공백·점·밑줄·하이픈만 사용하세요.');
  if (!(meta.kind === 'skill' ? (/\.json$/.test(file.name) || file.name === 'SKILL.md') : /\.(md|txt)$/.test(file.name))) throw new Error('Skill은 .json 또는 SKILL.md, 문서는 .md 또는 .txt 파일을 지원합니다.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0') || text.trim().length < 5) throw new Error('UTF-8 텍스트 파일을 확인하세요.');
  const contentFormat = meta.kind === 'document' ? 'document' : file.name === 'SKILL.md' ? 'agent-skill' : 'workflow';
  const skill = contentFormat === 'agent-skill' ? parseSkillFile(text) : null;
  if (skill && (!meta.capabilities || !meta.input || !meta.output)) throw new Error('SKILL.md가 수행할 기능과 입력·출력 형식을 선택하세요.');
  const descriptor = contentFormat === 'workflow' ? describe(skillSchema.parse(JSON.parse(text))) : skill ? { input: meta.input!, output: meta.output!, capabilities: meta.capabilities! } : { input: 'text', output: 'text', capabilities: ['document-reference'] };
  let asset = meta.assetId ? await get<Asset>('assets', meta.assetId) : undefined;
  if (meta.assetId && (!asset || asset.ownerId !== userId || asset.kind !== meta.kind)) throw new Error('수정할 상품의 소유자와 유형을 확인하세요.');
  if (asset && (await all<Version>('versions')).some(v => v.assetId === asset!.id && v.version === meta.version)) throw new Error('같은 버전이 이미 존재합니다. 버전 번호를 올려주세요.');
  asset ??= { id: crypto.randomUUID(), ownerId: userId, title: meta.title, summary: meta.summary, kind: meta.kind, createdAt: new Date().toISOString() };
  const id = crypto.randomUUID();
  const version: Version = { id, assetId: asset.id, ownerId: userId, version: meta.version, fileName: file.name,
    fileHash: hashBytes(bytes), storagePath: `${userId}/${id}/${file.name}`, ...descriptor,
    environment: ENVIRONMENT, license: meta.license, licenseHash: hashText(meta.license), limitations: meta.limitations,
    state: 'draft', createdAt: new Date().toISOString() };
  version.contentFormat = contentFormat;
  if (skill) { version.skillName = skill.name; version.allowedTools = skill.tools; }
  await storeFile(version.storagePath, bytes);
  await put('assets', asset);
  await put('versions', version);
  return { asset, version };
}
export async function prepareTerms(userId: string, versionId: string, input: unknown): Promise<Terms> {
  const values = termsInputSchema.parse(input), version = await ownedVersion(userId, versionId);
  const report = version.reportId ? await get<Report>('reports', version.reportId) : undefined;
  if (!report?.eligible || report.revokedAt || report.fileHashes[0] !== version.fileHash || !report.attestationTx || !await isFinalReport(report)) throw new Error('유효한 시험과 체인 등록을 먼저 완료하세요.');
  const b = await binding(userId);
  const terms: Terms = { seller: b.address, versionKey: hashText(version.id), fileHash: version.fileHash, reportHash: report.reportHash, licenseHash: version.licenseHash,
    sellerAmount: values.sellerAmount, platformFee: values.platformFee, maxDiscount: values.maxDiscount,
    validUntil: String(Math.floor(Date.now() / 1000) + values.validDays * 86400), nonce: BigInt(hashText(crypto.randomUUID())).toString() };
  quote([terms], ['0']);
  return terms;
}
export async function publish(userId: string, versionId: string, terms: Terms, signature?: `0x${string}`) {
  const version = await ownedVersion(userId, versionId), b = await binding(userId), c = await chainConfig();
  const report = await get<Report>('reports', version.reportId ?? '');
  if (!report?.eligible || report.revokedAt || terms.seller.toLowerCase() !== b.address.toLowerCase() || terms.versionKey !== hashText(version.id)
    || terms.fileHash !== version.fileHash || terms.reportHash !== report.reportHash || terms.licenseHash !== version.licenseHash) throw new Error('시험한 버전과 승인 조건이 일치하지 않습니다.');
  if (!await isFinalReport(report)) throw new Error('모델 시험 결과의 저장을 완료해야 판매할 수 있습니다.');
  quote([terms], ['0']);
  if (BigInt(terms.validUntil) <= BigInt(Math.floor(Date.now() / 1000))) throw new Error('판매 조건이 만료되었습니다.');
  if (!await currentAttestation(terms)) throw new Error('현재 유효한 체인 시험 기록이 없습니다.');
  if (isLocal() && !signature) signature = await (await localWallet(userId)).signTypedData(termsTypedData(terms, c.chain.id, c.market));
  if (!signature || !await verifyTerms(terms, signature)) throw new Error('판매자 서명을 확인하지 못했습니다.');
  const offer: Offer = { id: crypto.randomUUID(), ownerId: userId, versionId, terms, signature, chainId: c.chain.id, contract: c.market, createdAt: new Date().toISOString() };
  await put('offers', offer, true);
  await put('versions', { ...version, state: 'listed' }, true);
  await put('reports', report, true, userId);
  const asset = await get<Asset>('assets', version.assetId);
  if (asset) await put('assets', asset, true);
  return offer;
}
export async function stopSale(userId: string, id: string, reason = '판매자가 신규 판매를 중지했습니다.') {
  z.string().trim().min(3).max(500).parse(reason);
  const v = await ownedVersion(userId, id);
  const report = v.reportId ? await get<Report>('reports', v.reportId) : undefined;
  if (report?.attestationTx) await attest(v, report.reportHash, false);
  await put('versions', { ...v, state: 'suspended', statusReason: reason }, false);
  if (report) await put('reports', { ...report, revokedAt: new Date().toISOString() }, false, userId);
  for (const offer of (await all<Offer>('offers')).filter(o => o.versionId === id && !o.cancelledAt)) await put('offers', { ...offer, cancelledAt: new Date().toISOString() }, false);
  return { stopped: true };
}
export async function preparePurchase(ids: string[]) {
  z.array(z.uuid()).min(1).max(3).parse(ids);
  if (new Set(ids).size !== ids.length) throw new Error('중복된 상품이 있습니다.');
  const available = await catalog();
  const items = ids.map(id => available.find(i => i.version.id === id));
  if (items.some(i => !i)) throw new Error('판매 상태가 변경되었습니다. 구성을 다시 확인하세요.');
  const selected = items as CatalogItem[];
  if (selected.length > 1) {
    compositionShape(selected.map(i => i.version));
    const combo = (await marketReports()).find(r => r.kind === 'combination' && r.eligible && !r.revokedAt && r.environment === ENVIRONMENT
      && r.versionIds.join(',') === ids.join(',') && r.fileHashes.length === selected.length && r.fileHashes.every((hash, i) => selected[i].version.fileHash === hash)
      && (selected.every(i => contentFormat(i.version) === 'workflow') || !!r.modelEvaluation));
    if (!combo || !selected.every(i => i.version.licenseHash === selected[0].version.licenseHash)) throw new Error('현재 구성과 이용 조건의 조합 시험이 필요합니다.');
  }
  for (const item of selected) if (!await currentAttestation(item.offer!.terms)) throw new Error('시험 기록 또는 판매 조건이 취소되었습니다.');
  const terms = selected.map(i => i.offer!.terms), discounts = selected.map(i => selected.length > 1 ? i.offer!.terms.maxDiscount : '0');
  const c = await chainConfig();
  const signatures = selected.map(i => i.offer!.signature);
  return { items: selected, terms, signatures, discounts, ...quote(terms, discounts), quoteHash: hashObject({ terms, signatures, discounts }),
    orderId: hashText(crypto.randomUUID()), deadline: Math.floor(Date.now() / 1000) + 600,
    chainId: c.chain.id, market: c.market, token: c.token };
}
