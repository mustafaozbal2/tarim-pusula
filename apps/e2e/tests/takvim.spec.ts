import { expect, test } from '@playwright/test';

/**
 * G15 + G19: takvim ekranı ve duyuru kartı. Onaysız şablon ve duyuru çiftçi ekranında hiç görünmez;
 * onaylılarda kaynak + tarih görünür, "Neden?" gerekçeyi açar.
 */
test('Takvim: şimdi ve yaklaşan işler, rozet, kaynak, Neden?; duyuru kartı kaynak + tarih + Neden?', async ({
  page,
}) => {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: {
      name: 'Burç Köyü Fıstık Bahçesi',
      province: 'Gaziantep',
      lat: 37.0662,
      lon: 37.3833,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  expect((await page.request.get('/__e2e/calendar-seed?approve=1')).ok()).toBe(true);
  expect((await page.request.get('/__e2e/announce?approve=1')).ok()).toBe(true);
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );

  await page.goto('/tarlalarim');
  await page.getByRole('button', { name: 'Tarla takvimi' }).click();
  await expect(page.getByTestId('takvim-tarla')).toHaveText('Burç Köyü Fıstık Bahçesi');
  const now = page.getByTestId('takvim-simdi');
  await expect(now).toContainText('Bahçe temizliği');
  await expect(page.getByText(/onayı bekl/i)).toHaveCount(0);
  await expect(now.getByTestId('takvim-kaynak')).toContainText('e2e Rehberi · v1 · 2026-01-01');
  const soon = page.getByTestId('takvim-yaklasan');
  await expect(soon).toContainText('Budama');
  // G23: "Son güncelleme" çiftçi ekranında gösterilmez.
  await expect(page.getByTestId('takvim-guncelleme')).toHaveCount(0);
  await now.getByRole('button', { name: 'Neden?' }).click();
  await expect(now).toContainText('ürününüze göre');

  // Bugün: duyuru kartı.
  await page.goto('/');
  await page
    .getByTestId('kart-seridi-kart')
    .filter({ hasText: 'Sulama toplantısı duyurusu' })
    .first()
    .click();
  const card = page
    .getByTestId('duyuru-karti')
    .filter({ hasText: 'Sulama toplantısı duyurusu' })
    .first();
  await expect(card).toContainText('Sulama toplantısı duyurusu');
  await expect(page.getByText(/onayı bekl/i)).toHaveCount(0);
  await expect(card.getByTestId('duyuru-kaynak')).toContainText(
    'Kaynak: Gaziantep İl Tarım ve Orman Müdürlüğü · Yayın:',
  );
  await expect(card.getByTestId('duyuru-neden-metin')).toHaveCount(0);
  await card.getByTestId('duyuru-neden').click();
  await expect(card.getByTestId('duyuru-neden-metin')).toContainText('Gaziantep');
});
