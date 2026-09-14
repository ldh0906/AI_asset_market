import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { apiError, assertOrigin, jsonBody, uploadBody } from '../../../../server/http';
import { currentUser, loginLocal, requireUser, supabaseAuth } from '../../../../server/auth';
import { all, get, put, consumeChallenge } from '../../../../server/database';
import { isLocal, appOrigin } from '../../../../server/config';
import { catalog, marketReports, registerAsset, ownedVersion, prepareTerms, publish, stopSale, preparePurchase } from '../../../../server/market';
import { evaluate } from '../../../../server/evaluation';
import { binding, chainConfig, chainClient, canDownload, localBuy, recordPurchase } from '../../../../server/chain';
import { loadFile } from '../../../../server/storage';
import { hashBytes } from '../../../../domain/hash';
import { recommend } from '../../../../domain/recommend';
import { intentSchema } from '../../../../domain/validation';
import type { Asset, Challenge, Offer, Purchase, Report, Terms, Version, WalletBinding } from '../../../../domain/model';
import { freePackageByVersion } from '../../../../domain/free-packages';
import { claimFree, downloadFree, freeClaimsFor } from '../../../../server/free';
import { draftStory, loadMedia, publishStory, saveStory, uploadMedia } from '../../../../server/stories';
import type { ProductStory } from '../../../../domain/model';
import { extractIntent } from '../../../../server/ai';
import { createJob, stepJob, cancelJob, listJobs } from '../../../../server/evaluation-jobs';
import { salesFor } from '../../../../domain/sales';
import { modelConfigured } from '../../../../server/model-provider';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const parts = (await context.params).path, route = parts.join('/');
    if (route === 'session') return NextResponse.json({ user: await currentUser(), local: isLocal(), aiConfigured: modelConfigured() });
    if (route === 'catalog') return NextResponse.json({ items: await catalog() });
    if (parts[0] === 'media' && parts[1]) {
      const loaded = await loadMedia(parts[1], (await currentUser())?.id ?? null);
      if (!loaded) return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
      return new Response(Buffer.from(loaded.bytes), { headers: { 'Content-Type': loaded.media.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (parts[0] === 'product' && parts[1]) {
      const id = z.uuid().parse(parts[1]);
      let item = (await catalog()).find(i => i.asset.id === id || i.version.id === id);
      let unavailableReason: string | null = item && !item.offer && !item.version.freePackage ? (item.version.statusReason ?? (item.version.state === 'suspended' ? '신규 판매가 중지되었습니다.' : ['draft', 'review'].includes(item.version.state) ? '판매 승인 전입니다.' : '현재 유효한 판매 조건이나 시험 기록이 없습니다.')) : null;
      if (!item) {
        const [assets, versions, offers] = await Promise.all([all<Asset>('assets'), all<Version>('versions'), all<Offer>('offers')]);
        const asset = assets.find(a => a.id === id || versions.some(v => v.id === id && v.assetId === a.id));
        const version = versions.filter(v => v.assetId === asset?.id && ['listed', 'suspended'].includes(v.state) && offers.some(o => o.versionId === v.id)).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (asset && version) { item = { asset, version, report: version.reportId ? await get<Report>('reports', version.reportId) : undefined }; unavailableReason = version.statusReason ?? (version.state === 'suspended' ? '신규 판매가 중지되었습니다.' : '현재 유효한 판매 조건이나 시험 기록이 없습니다.'); }
      }
      if (!item) return NextResponse.json({ error: '상품을 찾을 수 없습니다.' }, { status: 404 });
      const user = await currentUser();
      const claimed = !!user && !!item.version.freePackage && (await freeClaimsFor(user.id)).some(c => c.versionId === item.version.id);
      const story = item.version.freePackage ? null : await get<ProductStory>('product_stories', item.asset.id);
      return NextResponse.json({ item, claimed, unavailableReason, story: story?.published ? { content: story.published, meta: story.publishedMeta, publishedAt: story.publishedAt } : null });
    }
    if (route === 'runtime') {
      const sources = await Promise.all(['engine.mjs', 'runner-cli.mjs'].map(name => readFile(path.resolve('evaluator', name), 'utf8')));
      const source = '// AI Asset Market trusted runtime: market-tools/1.0.0\n' + sources.join('\n');
      return new Response(source, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Disposition': 'attachment; filename="market-tools-1.0.0.mjs"', 'Cache-Control': 'no-store', 'X-Runtime-SHA256': hashBytes(new TextEncoder().encode(source)) } });
    }
    if (route === 'chain') { const c = await chainConfig(); return NextResponse.json({ chainId: c.chain.id, market: c.market, token: c.token }); }
    const user = await requireUser();
    if (parts[0] === 'story' && parts[1]) return NextResponse.json(await draftStory(user.id, parts[1]));
    if (route === 'evaluation-jobs') return NextResponse.json({ jobs: await listJobs(user.id) });
    if (route === 'workspace') {
      const [assets, versions, reports, offers, purchases, freeClaims] = await Promise.all([all<Asset>('assets'), all<Version>('versions'), marketReports(), all<Offer>('offers'), all<Purchase>('purchases'), freeClaimsFor(user.id)]);
      const ownedVersions = versions.filter(v => v.ownerId === user.id);
      const jobs = await listJobs(user.id);
      return NextResponse.json({ assets: assets.filter(a => a.ownerId === user.id), versions: ownedVersions,
        reports: reports.filter(r => r.versionIds.some(id => ownedVersions.some(v => v.id === id)) || jobs.some(j => j.reportId === r.id)),
        offers: offers.filter(o => o.ownerId === user.id), purchases: purchases.filter(p => p.ownerId === user.id),
        purchasedItems: versions.filter(v => purchases.some(p => p.ownerId === user.id && p.versionIds.includes(v.id))).map(v => ({ ...v, title: assets.find(a => a.id === v.assetId)?.title })),
        sales: salesFor(user.id, assets, versions, purchases), freeClaims,
      });
    }
    if (parts[0] === 'download') {
      const free = freePackageByVersion(z.uuid().parse(parts[1]));
      if (free) {
        const { item, bytes } = await downloadFree(user.id, free.version.id);
        return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${item.version.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Asset-SHA256': item.version.fileHash } });
      }
      const v = await get<Version>('versions', z.uuid().parse(parts[1]));
      if (!v || !await canDownload(user.id, v)) return NextResponse.json({ error: '해당 버전의 구매 권한이 없습니다.' }, { status: 403 });
      const bytes = await loadFile(v.storagePath);
      if (hashBytes(bytes) !== v.fileHash) throw new Error('상품 파일 해시가 일치하지 않아 제공을 중단했습니다.');
      return new Response(Buffer.from(bytes), { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(v.fileName)}`, 'Cache-Control': 'no-store', 'X-Asset-SHA256': v.fileHash } });
    }
    return NextResponse.json({ error: '경로를 찾을 수 없습니다.' }, { status: 404 });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    assertOrigin(request);
    const parts = (await context.params).path, route = parts.join('/');
    if (route === 'login') {
      const body = await jsonBody(request);
      if (isLocal()) await loginLocal(z.string().parse(body.role));
      else {
        const input = z.object({ email: z.email(), password: z.string().min(8).max(128), signup: z.boolean().optional() }).parse(body);
        const auth = (await supabaseAuth()).auth;
        const result = input.signup ? await auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: `${appOrigin()}/auth/callback` } }) : await auth.signInWithPassword({ email: input.email, password: input.password });
        if (result.error) throw new Error(input.signup ? '이메일 형식과 8자 이상의 비밀번호를 확인하세요. 이미 가입한 아이디라면 로그인하세요.' : '이메일 또는 비밀번호를 확인하세요.');
        if (!result.data.session) return NextResponse.json({ message: '이메일의 인증 링크를 확인하세요.' });
      }
      return NextResponse.json({ user: await currentUser() });
    }
    if (route === 'logout') {
      if (isLocal()) (await cookies()).delete('market-local-session'); else await (await supabaseAuth()).auth.signOut();
      return NextResponse.json({ ok: true });
    }
    const user = await requireUser();
    if (route === 'assets') {
      if (Number(request.headers.get('content-length')) > 1100000) throw new Error('업로드는 1MB까지 지원합니다.');
      return NextResponse.json(await registerAsset(user.id, await uploadBody(request)));
    }
    if (route === 'media/upload') return NextResponse.json(await uploadMedia(user.id, await uploadBody(request)));
    const body = await jsonBody(request);
    if (route === 'story/save') return NextResponse.json({ story: await saveStory(user.id, body) });
    if (route === 'story/publish') return NextResponse.json(await publishStory(user.id, body.assetId));
    if (route === 'free/claim') return NextResponse.json({ claim: await claimFree(user.id, body.versionId) });
    if (route === 'evaluation-jobs/create') return NextResponse.json(await createJob(user.id, body.versionIds));
    if (route === 'evaluation-jobs/step') return NextResponse.json(await stepJob(user.id, body.id));
    if (route === 'evaluation-jobs/cancel') return NextResponse.json(await cancelJob(user.id, body.id));
    if (route === 'intent') return NextResponse.json(await extractIntent(z.string().parse(body.goal)));
    if (route === 'evaluate') {
      const ids = z.array(z.uuid()).min(1).max(3).parse(body.versionIds);
      if (new Set(ids).size !== ids.length) throw new Error('중복된 시험 상품입니다.');
      const versions = await Promise.all(ids.map(async id => {
        const v = await get<Version>('versions', id);
        if (!v || (v.ownerId !== user.id && v.state !== 'listed')) throw new Error('시험할 수 없는 상품입니다.');
        return v;
      }));
      if (versions.length === 1) await ownedVersion(user.id, ids[0]);
      if (versions.length === 1 && versions[0].state === 'listed') throw new Error('판매를 중지한 뒤 새 시험을 실행하세요.');
      const report = await evaluate(versions);
      if (versions.length === 1) await put('versions', { ...versions[0], state: 'review', reportId: report.id }, false);
      else await put('reports', report, true, user.id);
      return NextResponse.json({ report });
    }
    if (route === 'terms') return NextResponse.json({ terms: await prepareTerms(user.id, z.uuid().parse(body.versionId), body) });
    if (route === 'publish') {
      const id = z.uuid().parse(body.versionId);
      const terms = isLocal() ? await prepareTerms(user.id, id, body) : body.terms as Terms;
      return NextResponse.json({ offer: await publish(user.id, id, terms, body.signature) });
    }
    if (route === 'stop') return NextResponse.json(await stopSale(user.id, z.uuid().parse(body.versionId), body.reason));
    if (route === 'recommend') {
      const intent = intentSchema.parse(body);
      return NextResponse.json(recommend(intent, await catalog(), await marketReports()));
    }
    if (route === 'quote') return NextResponse.json(await preparePurchase(body.versionIds));
    if (route === 'purchase') {
      const q = await preparePurchase(body.versionIds);
      if (body.quoteHash !== q.quoteHash) throw new Error('판매 조건이 변경되었습니다. 새 견적을 확인하고 다시 승인하세요.');
      return NextResponse.json({ purchase: await localBuy(user.id, q.terms, q.signatures, q.discounts, q.orderId, q.deadline) });
    }
    if (route === 'receipt') return NextResponse.json({ purchase: await recordPurchase(user.id, z.string().regex(/^0x[a-fA-F0-9]{64}$/).parse(body.txHash) as `0x${string}`) });
    if (route === 'wallet/challenge') {
      const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/).parse(body.address);
      const id = crypto.randomUUID(), expiresAt = new Date(Date.now() + 300000).toISOString();
      const message = `AI Asset Market wallet link\nOrigin: ${appOrigin()}\nAccount: ${user.id}\nWallet: ${address}\nNonce: ${id}\nExpires: ${expiresAt}\nThis links a wallet and does not authorize a purchase.`;
      const challenge: Challenge = { id, ownerId: user.id, message, expiresAt, used: false };
      await put('challenges', challenge);
      return NextResponse.json(challenge);
    }
    if (route === 'wallet/verify') {
      const challenge = await get<Challenge>('challenges', z.uuid().parse(body.id));
      if (!challenge || challenge.ownerId !== user.id || challenge.used || new Date(challenge.expiresAt).getTime() <= Date.now()) throw new Error('지갑 인증 요청이 만료됐습니다.');
      const address = challenge.message.match(/Wallet: (0x[a-fA-F0-9]{40})/)?.[1] as `0x${string}`;
      const signature = z.string().regex(/^0x[a-fA-F0-9]+$/).parse(body.signature) as `0x${string}`;
      const { client } = await chainClient();
      if (!await client.verifyMessage({ address, message: challenge.message, signature })) throw new Error('지갑 서명을 확인하지 못했습니다.');
      const prior = (await all<WalletBinding>('wallets')).find(w => w.ownerId === user.id);
      if (prior && prior.address.toLowerCase() !== address.toLowerCase()) throw new Error('구매 권한 보호를 위해 연결된 지갑 변경은 현재 지원하지 않습니다.');
      if (!await consumeChallenge(challenge.id, user.id)) throw new Error('이미 사용한 지갑 인증 요청입니다.');
      return NextResponse.json({ wallet: prior ?? await put('wallets', { id: crypto.randomUUID(), ownerId: user.id, address }) });
    }
    if (route === 'wallet') return NextResponse.json({ wallet: await binding(user.id) });
    return NextResponse.json({ error: '경로를 찾을 수 없습니다.' }, { status: 404 });
  } catch (e) { return apiError(e); }
}
