import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const origin = 'http://127.0.0.1:3100';
test('two sellers → real evaluations → tested set → atomic purchase → exact version download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '필요한 작업에서 시작하세요' })).toBeVisible();
  async function switchUser(role: string, name: string) {
    await page.getByRole('combobox', { name: '로컬 테스트 계정' }).selectOption(role);
    await expect(page.locator('.account')).toContainText(name);
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  }
  const suffix = Date.now().toString();
  async function register(sample: string, title: string) {
    await page.getByRole('button', { name: '판매자 작업실', exact: true }).click();
    await page.getByRole('button', { name: sample, exact: true }).click();
    await page.getByLabel('상품명', { exact: true }).fill(title);
    const upload = page.waitForResponse(r => r.url().endsWith('/api/market/assets') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '파일·버전 등록', exact: true }).click();
    const response = await upload; expect(response.ok(), await response.text()).toBeTruthy();
    const { version } = await response.json();
    const card = page.locator('article.asset').filter({ has: page.getByRole('heading', { name: `${title} v1.0.0` }) });
    const evaluation = page.waitForResponse(r => r.url().endsWith('/api/market/evaluate'));
    await card.getByRole('button', { name: '시험 실행', exact: true }).click();
    const evaluationResponse = await evaluation; expect(evaluationResponse.ok(), await evaluationResponse.text()).toBeTruthy();
    const { report } = await evaluationResponse.json();
    expect(report.eligible).toBe(true); expect(report.attestationTx).toMatch(/^0x/);
    await expect(card.getByRole('heading', { name: '판매 조건 승인' })).toBeVisible();
    await card.getByLabel('판매자 수령 TEST').fill('40');
    const publishing = page.waitForResponse(r => r.url().endsWith('/api/market/publish'));
    await card.getByRole('button', { name: '테스트 지갑으로 조건 승인·판매' }).click();
    const published = await publishing; expect(published.ok(), await published.text()).toBeTruthy();
    await expect(card.getByText('판매 중', { exact: true })).toBeVisible();
    return version;
  }
  await switchUser('seller', '판매자 하나');
  const titleA = `코드 점검 ${suffix}`, titleB = `보고서 ${suffix}`;
  const a = await register('코드 위험 패턴 점검', titleA);
  await switchUser('seller2', '판매자 둘');
  const b = await register('점검·집계 보고서 작성', titleB);
  const forbiddenEdit = await page.request.post('/api/market/stop', { headers: { Origin: origin }, data: { versionId: a.id } });
  expect(forbiddenEdit.status()).toBe(400);
  await switchUser('buyer', '구매자');
  const denied = await page.request.get(`/api/market/download/${a.id}`);
  expect(denied.status()).toBe(403);
  await page.getByRole('button', { name: '구성 추천', exact: true }).first().click();
  await page.getByText('새 조합 시험', { exact: true }).click();
  await page.getByRole('checkbox', { name: `${titleA} (code → json)` }).check();
  await page.getByRole('checkbox', { name: `${titleB} (json → markdown)` }).check();
  const combo = page.waitForResponse(r => r.url().endsWith('/api/market/evaluate'));
  await page.getByRole('button', { name: '선택한 순서로 조합 시험' }).click();
  const comboResponse = await combo; expect(comboResponse.ok(), await comboResponse.text()).toBeTruthy();
  const comboReport = (await comboResponse.json()).report;
  expect(comboReport.accuracy.passed).toBe(5);
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await page.locator('main').getByRole('button', { name: '구성 추천', exact: true }).click();
  await expect(page.getByRole('heading', { name: '시험된 조합을 찾았습니다' })).toBeVisible();
  // Quote the just-created set explicitly so pre-existing local samples do not influence the E2E oracle.
  const quote = await page.request.post('/api/market/quote', { headers: { Origin: origin }, data: { versionIds: [a.id, b.id] } });
  expect(quote.ok()).toBeTruthy();
  const q = await quote.json(); expect(q.total).toBe('90'); expect(q.sellerTotal).toBe('80'); expect(q.platformFee).toBe('10');
  const alteredQuote = await page.request.post('/api/market/purchase', { headers: { Origin: origin }, data: { versionIds: [a.id, b.id], quoteHash: 'changed' } });
  expect(alteredQuote.status()).toBe(400);
  await page.getByRole('button', { name: '추천 구성 구매 조건 확인' }).click();
  const dialog = page.getByRole('dialog', { name: '최종 구매 조건' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '구매 승인' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  const purchaseResponse = page.waitForResponse(r => r.url().endsWith('/api/market/purchase'));
  await dialog.getByRole('button', { name: '구매 승인' }).click();
  const bought = await purchaseResponse; expect(bought.ok(), await bought.text()).toBeTruthy();
  const purchase = (await bought.json()).purchase;
  expect(purchase.total).toBe('90'); expect(purchase.platformFee).toBe('10');
  expect(purchase.settlements.map((s: { amount: string }) => s.amount)).toEqual(['40', '40']);
  await expect(page.getByRole('heading', { name: '보관함·거래 내역' })).toBeVisible();
  await expect(page.getByText('구매 파일 사용 안내', { exact: true }).first()).toBeVisible();
  const runtime = await page.request.get('/api/market/runtime');
  expect(runtime.ok()).toBeTruthy();
  expect(`0x${createHash('sha256').update(await runtime.body()).digest('hex')}`).toBe(runtime.headers()['x-runtime-sha256']);
  expect(await runtime.text()).toContain('async function marketMain');
  const purchasedVersionId = purchase.versionIds[0];
  const downloaded = await page.request.get(`/api/market/download/${purchasedVersionId}`);
  expect(downloaded.ok()).toBeTruthy();
  expect(`0x${createHash('sha256').update(await downloaded.body()).digest('hex')}`).toBe(downloaded.headers()['x-asset-sha256']);
  const sync = await page.request.post('/api/market/receipt', { headers: { Origin: origin }, data: { txHash: purchase.txHash } });
  expect((await sync.json()).purchase.id).toBe(purchase.id);
  await page.screenshot({ path: 'test-results/purchased-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '보관함·거래 내역' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/purchased-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  // Stop the exact purchased first version and verify old rights survive but new checkout fails.
  const allItems = (await (await page.request.get('/api/market/catalog')).json()).items;
  const first = allItems.find((i: any) => i.version.id === purchasedVersionId);
  await switchUser(first.version.ownerId.endsWith('1') ? 'seller' : 'seller2', first.version.ownerId.endsWith('1') ? '판매자 하나' : '판매자 둘');
  const sellerWorkspace = await (await page.request.get('/api/market/workspace')).json();
  const ownSale = sellerWorkspace.sales.find((s: any) => s.txHash === purchase.txHash && s.versionId === purchasedVersionId);
  expect(ownSale.sellerAmount).toBe('40'); expect(ownSale).not.toHaveProperty('settlements');
  const stopped = await page.request.post('/api/market/stop', { headers: { Origin: origin }, data: { versionId: purchasedVersionId } });
  expect(stopped.ok(), await stopped.text()).toBeTruthy();
  await switchUser('buyer', '구매자');
  expect((await page.request.get(`/api/market/download/${purchasedVersionId}`)).ok()).toBeTruthy();
  expect((await page.request.post('/api/market/quote', { headers: { Origin: origin }, data: { versionIds: purchase.versionIds } })).status()).toBe(400);
});

test('rejects cross-origin writes and unauthenticated private data', async ({ request }) => {
  expect((await request.get('/api/market/workspace')).status()).toBe(401);
  expect((await request.post('/api/market/login', { headers: { Origin: 'https://untrusted.example' }, data: { role: 'seller' } })).status()).toBe(400);
});

test('applies extracted budget and requires an explicit change of unsupported environment', async ({ page }) => {
  // Only the UI is exercised with this fixture; no model call or stored report is produced.
  await page.route('**/api/market/session', async route => {
    const response = await route.fetch(); await route.fulfill({ response, json: { ...await response.json(), aiConfigured: true } });
  });
  await page.route('**/api/market/intent', route => route.fulfill({ json: { capabilities: ['code-review', 'report'], input: 'code', output: 'markdown', budget: '0', environment: 'custom-agent', questions: ['현재 시험 환경을 사용할 수 있나요?'], source: 'isolated-ui-test' } }));
  await page.goto('/'); await page.getByRole('combobox', { name: '로컬 테스트 계정' }).selectOption('buyer');
  await expect(page.locator('.account')).toContainText('구매자');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '구성 추천', exact: true }).first().click();
  await page.getByRole('button', { name: 'AI로 요구조건 정리' }).click();
  await expect(page.getByLabel('최대 상품 예산 TEST')).toHaveValue('0');
  const recommend = page.locator('main').getByRole('button', { name: '구성 추천', exact: true });
  await expect(recommend).toBeDisabled();
  await page.getByRole('checkbox', { name: 'market-tools/1.0.0 환경으로 요청을 변경합니다.' }).check();
  await expect(recommend).toBeEnabled();
  const request = page.waitForRequest(r => r.url().endsWith('/api/market/recommend'));
  await recommend.click(); expect((await request).postDataJSON()).toMatchObject({ budget: '0', environment: 'market-tools/1.0.0' });
});

test('registers standard SKILL.md but cannot sell an unmeasured skill or invent model results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: '로컬 테스트 계정' }).selectOption('seller');
  await expect(page.locator('.account')).toContainText('판매자 하나');
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '판매자 작업실', exact: true }).click();
  const title = `표준 Skill ${Date.now()}`;
  await page.getByLabel('상품명', { exact: true }).fill(title);
  await page.getByLabel('상품 설명', { exact: true }).fill('표준 머리말과 허용 도구를 포함하는 코드 점검 Skill입니다.');
  await page.getByLabel('상품 파일 (최대 1MB)').setInputFiles({ name: 'SKILL.md', mimeType: 'text/markdown', buffer: Buffer.from('---\nname: code-review\ndescription: Review supplied code with fixed tools.\nallowed-tools: code.review\n---\nUse code.review to inspect the supplied code and return its JSON findings.') });
  await expect(page.getByLabel('Skill 입력 형식')).toBeVisible();
  const upload = page.waitForResponse(r => r.url().endsWith('/api/market/assets'));
  await page.getByRole('button', { name: '파일·버전 등록', exact: true }).click();
  const response = await upload; expect(response.ok(), await response.text()).toBeTruthy();
  const { version } = await response.json(); expect(version.contentFormat).toBe('agent-skill');
  const card = page.locator('article.asset').filter({ has: page.getByRole('heading', { name: `${title} v1.0.0` }) });
  await card.getByRole('button', { name: '시험 실행', exact: true }).click();
  await expect(card.getByText('업무 성능 미평가', { exact: true })).toBeVisible();
  await expect(card.getByRole('heading', { name: '판매 조건 승인' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '모델 비교 시험 준비' })).toBeDisabled();
  const denied = await page.request.post('/api/market/publish', { headers: { Origin: origin }, data: { versionId: version.id, sellerAmount: '40', platformFee: '10', maxDiscount: '5', validDays: 30 } });
  expect(denied.status()).toBe(400);
  const noModel = await page.request.post('/api/market/evaluation-jobs/create', { headers: { Origin: origin }, data: { versionIds: [version.id] } });
  expect(noModel.status()).toBe(400); expect((await noModel.json()).error).toContain('AI 모델 연결');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('preserves raw UTF-8 BOM bytes and old versions, and rejects file tampering', async ({ request }) => {
  await request.post('/api/market/login', { headers: { Origin: origin }, data: { role: 'seller' } });
  const initial = Buffer.from('\ufeff# Reference\r\nThis is a versioned document for checking exact byte identity and immutable downloads.\r\n', 'utf8');
  const metadata = { title: `문서 버전 ${Date.now()}`, summary: '원본 바이트와 새 버전의 분리를 검사하는 문서입니다.', kind: 'document', version: '1.0.0', license: '개인 및 팀 내부 검증용으로 사용할 수 있습니다.', limitations: ['내용 정확성은 별도 검토가 필요합니다.'] };
  const uploaded = await request.post('/api/market/assets', { headers: { Origin: origin }, multipart: { metadata: JSON.stringify(metadata), file: { name: 'reference.md', mimeType: 'text/markdown', buffer: initial } } });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
  const { asset, version } = await uploaded.json();
  expect(version.fileHash).toBe(`0x${createHash('sha256').update(initial).digest('hex')}`);
  const update = await request.post('/api/market/assets', { headers: { Origin: origin }, multipart: { metadata: JSON.stringify({ ...metadata, assetId: asset.id, version: '2.0.0' }), file: { name: 'reference.md', mimeType: 'text/markdown', buffer: Buffer.from('# Updated reference\nA completely different document, with new content and its own version.\n') } } });
  expect(update.ok(), await update.text()).toBeTruthy();
  expect(await (await request.get(`/api/market/download/${version.id}`)).body()).toEqual(initial);
  const root = path.resolve('.data/files'), file = path.resolve(root, version.storagePath);
  expect(file.startsWith(root + path.sep)).toBe(true);
  const original = await readFile(file);
  try {
    await writeFile(file, 'Changed test file');
    const blocked = await request.get(`/api/market/download/${version.id}`);
    expect(blocked.status()).toBe(400); expect((await blocked.json()).error).toContain('해시');
  } finally { await writeFile(file, original); }
});
