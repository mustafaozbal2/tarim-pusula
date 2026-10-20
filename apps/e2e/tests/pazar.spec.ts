import { expect, test } from '@playwright/test';

/**
 * G10 kabul ölçütü: Pazar ekranı yalnız kaynaklı fiyat gösterir; kaynak, tarih ve mesafe görünür.
 * Fiyat kaynağı bağlanmadan önce "kaynaklı fiyat bulamadık" der, rakam uydurmaz.
 */
test('Pazar: fiyat gelmeden uydurma yok; toplayıcıdan sonra kaynaklı fiyat, tarih, mesafe', async ({
  page,
}) => {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: { name: 'Burç Köyü Fıstık Bahçesi', lat: 37.1, lon: 37.4, cropId: 'antep-fistigi' },
  });
  expect(created.status()).toBe(201);
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );

  // Tarla listesi önbelleği Bugün ekranında dolar (mesafe için seçili tarla).
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toBeVisible();

  await page.goto('/pazar');
  await expect(page.getByTestId('pazar-yok')).toContainText('kaynaklı fiyat bulamadık');
  await expect(page.getByTestId('pazar-fiyat')).toHaveCount(0);

  const run = (await (await page.request.get('/__e2e/market-collect')).json()) as {
    status: string;
  }[];
  expect(run[0]!.status).toBe('ok');

  await page.goto('/pazar');
  await expect(page.getByRole('button', { name: 'Antep fıstığı' })).toBeVisible();
  await expect(page.getByTestId('pazar-fiyat')).toContainText('285 ₺'); // (275 + 295,5) / 2 = 285,25
  await expect(page.getByTestId('pazar-kaynak')).toContainText('Kaynak: Gaziantep Ticaret Borsası');
  await expect(page.getByTestId('pazar-trend')).toContainText('yeterli veri yok'); // tek günlük kayıt: trend uydurulmaz
  const yer = page.getByTestId('pazar-yer-borsa-gaziantep');
  await expect(yer).toBeVisible();
  await expect(page.getByText(/km uzakta/)).toBeVisible();
  await expect(page.getByTestId('pazar-net-borsa-gaziantep')).toContainText(
    'yeterli günlük fiyat yok',
  );
  await expect(page.getByTestId('pazar-guncelleme')).toContainText('Son güncelleme');
});
