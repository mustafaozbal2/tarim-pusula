import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * G19: ana sayfa (docs/ANASAYFA_SPEC.md). Ekran görüntüleri docs/gorsel/ içine yazılır
 * (hedefle yan yana karşılaştırma: docs/gorsel/ANASAYFA_FARK.md).
 */
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel');

async function prepare(page: Page) {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: {
      name: 'Kiraz Bahçesi',
      province: 'Gaziantep',
      district: 'Nizip',
      lat: 37.76,
      lon: 30.55,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  await page.request.get('/__e2e/calendar-seed?approve=1');
  await page.request.get('/__e2e/announce?n=7&approve=1');
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
}

for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
]) {
  test(`ana sayfa ${size.width}x${size.height}: yerleşim ve ekran görüntüsü`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    await prepare(page);
    await page.goto('/');
    await expect(page.getByTestId('bugun-tarla')).toHaveText('Kiraz Bahçesi');
    await expect(page.getByTestId('arazi-yer')).toHaveText('Gaziantep, Nizip');
    // 7 yuvarlak ikon, alt sekme çubuğu yok
    for (const k of [
      'arazilerim',
      'arazi-islemleri',
      'verim-haritasi',
      'hava',
      'uzman',
      'bildirim',
      'ayarlar',
    ]) {
      await expect(page.getByTestId(`ikon-${k}`)).toBeVisible();
    }
    await expect(page.getByRole('tablist')).toHaveCount(0);
    // 5 sekme
    for (const k of ['zaman', 'rehber', 'uyari', 'hibe', 'hepsi']) {
      await expect(page.getByTestId(`sekme-${k}`)).toBeVisible();
    }
    await expect(page.getByText('Uzman onayı bekliyor')).toHaveCount(0);
    // yatay taşma yok
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({
      path: resolve(OUT, `anasayfa_${size.width}x${size.height}.png`),
    });
    await ctx.close();
  });
}

test('ana sayfa: her ikon doğru sayfaya gider', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await prepare(page);
  const routes: [string, RegExp][] = [
    ['arazilerim', /\/tarlalarim$/],
    ['arazi-islemleri', /\/arazi-islemleri$/],
    ['verim-haritasi', /\/verim-haritasi$/],
    ['hava', /\/hava$/],
    ['uzman', /\/soru-sor$/],
    ['bildirim', /\/bildirimler$/],
    ['ayarlar', /\/ayarlar$/],
  ];
  for (const [key, url] of routes) {
    await page.goto('/');
    await page.getByTestId(`ikon-${key}`).click();
    await expect(page).toHaveURL(url);
  }
  await ctx.close();
});

test('ana sayfa: kart şeridi kendiliğinden kayar, arazi seçici açılır, sekme değişir', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await prepare(page);
  await page.goto('/');
  const strip = page.getByTestId('kart-seridi');
  await expect(strip).toBeVisible();
  await expect(page.getByTestId('kart-seridi-kart').first()).toBeVisible();
  const x0 = await strip.evaluate((el) => el.scrollLeft);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft), { timeout: 12_000 }).not.toBe(x0);

  // G23: sağ kenar menüsü yok; arazi adına dokununca (tek arazide de) seçici ve "Arazi ekle" açılır.
  await expect(page.getByTestId('yan-menu-tutamac')).toHaveCount(0);
  await page.getByTestId('arazi-blogu').click();
  await expect(page.getByTestId('arazi-secici')).toBeVisible();
  await page.getByTestId('arazi-secici-ekle').click();
  await expect(page).toHaveURL(/\/tarla-ekle/);

  await page.goto('/');
  await page.getByTestId('sekme-hepsi').click();
  await expect(page.getByTestId('ana-sekmeli-kart')).toBeVisible();
  await ctx.close();
});

test('ayarlar: sunucu adresi kartı yalnız geliştirici modunda', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await prepare(page);
  await page.goto('/ayarlar');
  await expect(page.getByTestId('sunucu-karti')).toHaveCount(0);
  await ctx.close();
});
