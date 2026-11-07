import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** G26 tasarım: giriş ve ana sayfa ekran görüntüleri (docs/gorsel/) ve temel görünürlük. */
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel');
const API = 'http://127.0.0.1:3111';

test('tasarım: giriş ekranı saydam amblem, canlı yazı ve kabartmalı kart', async ({ page }) => {
  await page.addInitScript((api) => localStorage.setItem('config.apiUrl', api), API);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
  await expect(page.getByText('TARIM PUSULA', { exact: true })).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/giris.png` });
  await page.getByTestId('giris-ciftci').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/giris-ciftci.png` });
});

test('tasarım: ana sayfada hava efekti ve yeşil robot asistan; robot tarla eklemeye götürür', async ({
  page,
}) => {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: {
      name: 'Fıstık Bahçesi',
      province: 'Gaziantep',
      district: 'Nizip',
      lat: 37.0662,
      lon: 37.3833,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  await page.goto('/');
  await expect(page.getByTestId('ana-bant')).toBeVisible();
  await expect(page.getByTestId('asistan-ac')).toBeVisible();
  // Açılışta karşılama balonu kısa süre görünür (metin i18n'de; burada yalnız robotun varlığı).
  await page.waitForTimeout(2200); // balon 1,2 sn sonra belirir
  const sahne = await page.locator('[data-testid^="hava-efekti-"]').getAttribute('data-testid');
  console.log('hava sahnesi:', sahne);
  await page.screenshot({ path: `${OUT}/anasayfa-asistan.png` });

  // Robot hafifçe süzüldüğü için "durağan" beklenmez.
  await page.getByTestId('asistan-ac').click({ force: true });
  await expect(page.getByTestId('asistan-panel')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/asistan-panel.png` });

  // Tarla ekleme sohbetin içinde olur: sayfa değişmez.
  const url0 = page.url();
  await page.getByTestId('asistan-yaz').fill('yeni tarla eklemek istiyorum');
  await page.getByTestId('asistan-gonder').click();
  await expect(page.getByTestId('asistan-cevap')).toContainText('Şu an arazinde misin?');
  expect(page.url()).toBe(url0);
});
