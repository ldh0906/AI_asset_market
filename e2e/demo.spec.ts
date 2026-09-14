import { test, expect } from '@playwright/test';

test('updated demo mirrors free catalogue, detail, claim and sample purchase', async ({ page }) => {
  await page.goto('/demo');
  await expect(page.locator('.feature-card')).toHaveCount(4);
  await expect(page.locator('.product-row')).toHaveCount(7);
  await page.getByRole('combobox', { name: '가격' }).selectOption('free');
  await page.getByRole('textbox', { name: '검색' }).fill('랜딩페이지');
  await expect(page.locator('.product-row')).toHaveCount(1);
  await page.locator('.product-row').getByRole('link', { name: '상세보기' }).click();
  await expect(page).toHaveURL(/\/demo\/products\//);
  await expect(page.getByRole('heading', { name: '랜딩페이지 패키지' })).toBeVisible();
  await expect(page.locator('.purchase-bar')).toContainText('무료');
  await page.goBack();
  await expect(page.getByRole('textbox', { name: '검색' })).toHaveValue('랜딩페이지');
  await expect(page.getByRole('combobox', { name: '가격' })).toHaveValue('free');
  await page.goForward();
  await page.reload();
  await expect(page.getByRole('button', { name: '무료로 받기' })).toBeVisible();
  await page.getByRole('button', { name: '무료로 받기' }).click();
  await expect(page.getByRole('heading', { name: '내가 담은 상품' })).toBeVisible();
  await expect(page.getByRole('link', { name: '실제 ZIP 받으러 가기' })).toHaveAttribute('href', /\/products\//);
  await page.getByRole('button', { name: '둘러보기' }).click();
  await page.getByRole('combobox', { name: '가격' }).selectOption('paid');
  await expect(page.locator('.product-row')).toHaveCount(3);
  await page.locator('.product-row').first().getByRole('link', { name: '상세보기' }).click();
  await page.getByRole('button', { name: '가상 구매', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '가상 구매 확인' })).toBeVisible();
  await page.getByRole('button', { name: '가상 구매 완료하기' }).click();
  await expect(page.getByRole('heading', { name: '내가 담은 상품' })).toBeVisible();
  await expect(page.getByRole('link', { name: '공개 예제 파일 받기' })).toBeVisible();
  await expect(page.locator('.demo-library-item')).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: '보관함' }).click();
  await expect(page.getByText('받거나 가상 구매한 상품이 여기에 나타납니다.')).toBeVisible();
});

test('demo recommendation and direct detail work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/products/complete');
  await expect(page.getByRole('heading', { name: '코드 점검과 보고서 단품' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '구성 추천' }).click();
  await expect(page.locator('.product-row')).toHaveCount(1);
  await page.getByRole('spinbutton', { name: '예산 (데모 TEST)' }).fill('149');
  await expect(page.getByText('이 예제 작업의 최소 구성 가격은 150 데모 TEST입니다.')).toBeVisible();
});

test('every demo detail labels sample images and test results as simulated', async ({ page }) => {
  const ids = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'review', 'report', 'complete'];
  for (const id of ids) {
    await page.goto(`/demo/products/${id}`);
    await expect(page.locator('.demo-report-disclaimer')).toContainText('실제 실행하거나 측정하지 않았습니다.');
    await expect(page.locator('.demo-cover figcaption')).toContainText('이미지');
    await expect(page.locator('.demo-story-figure figcaption')).toContainText('실제 실행 화면이나 시험 결과 캡처가 아닙니다.');
    expect(await page.locator('.demo-cover img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByText('가상 개별 판정과 실제 확인 범위 보기').click();
    expect(await page.locator('.demo-case-list li').count()).toBeGreaterThan(0);
    await expect(page.getByText('없음 · 데모 시나리오')).toBeVisible();
    if (id.startsWith('2')) await expect(page.getByText('운영 사이트에서 제공하는 무료 ZIP의 파일 구성 검사입니다.')).toBeVisible();
    else await expect(page.getByText('이 상품은 데모 전용 가상 상품이며 실제 파일·성능 검사 기록이 없습니다.')).toBeVisible();
  }
});

test('transaction demo executes settlement, hash rejection, discount rejection and combination invalidation', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('link', { name: '거래 안전성' }).click();
  await expect(page).toHaveURL(/\/demo\/transactions$/);
  await expect(page.getByText('체인 거래 아님')).toBeVisible();
  await page.getByRole('button', { name: '190 TEST로 조합 구매' }).click();
  await expect(page.getByText('구매·정산 완료')).toBeVisible();
  await expect(page.getByLabel('데모 잔액')).toContainText('310 TEST');
  await expect(page.getByLabel('데모 잔액')).toContainText('90 TEST');
  await expect(page.getByText('구매 권한 2개 발급')).toBeVisible();

  await page.getByRole('button', { name: '같은 주문 다시 실행' }).click();
  await expect(page.getByText('InvalidOrder · 같은 주문은 다시 정산하지 않았습니다.')).toBeVisible();
  await expect(page.getByLabel('데모 잔액')).toContainText('310 TEST');

  await page.getByRole('button', { name: '변조 파일 다운로드 시도' }).click();
  await expect(page.getByText('파일 제공 차단')).toBeVisible();
  const hashes = await page.locator('.transaction-result code').allTextContents();
  expect(hashes).toHaveLength(2);
  expect(hashes[0]).not.toBe(hashes[1]);

  await page.getByRole('button', { name: '한도 초과 구매 시도' }).click();
  await expect(page.getByText('InvalidDiscount · 거래 거절')).toBeVisible();
  await expect(page.getByLabel('데모 잔액')).toContainText('310 TEST');

  await page.getByRole('button', { name: '첫 상품 판매 중지' }).click();
  await expect(page.getByText('조합 신규 추천 제외', { exact: true })).toBeVisible();
  await expect(page.getByText('구매 권한 2개 발급')).toBeVisible();

  await page.getByRole('button', { name: '초기 상태로 다시 시작' }).click();
  await expect(page.getByLabel('데모 잔액')).toContainText('500 TEST');
  await expect(page.getByText('구매 권한 없음')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
