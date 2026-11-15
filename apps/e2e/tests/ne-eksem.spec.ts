import { expect, test, type Page } from '@playwright/test';

/** Ne Eksem: alt çubuktan açılır; seçili tarla ve bölge görünür; ilk 3 ürün; niyet beyanı; tarla değiştirme; menü. */
interface User {
  api: string;
  token: string;
}

async function login(page: Page): Promise<User> {
  const u = (await (await page.request.get('/__e2e/user')).json()) as User;
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [u.api, u.token],
  );
  return u;
}

test('Ne Eksem: sıralama, niyet beyanı, tarla değiştirme, neden kartı', async ({ page }) => {
  const u = await login(page);
  const h = { authorization: `Bearer ${u.token}` };
  const r1 = await page.request.post(`${u.api}/fields`, {
    headers: h,
    data: {
      name: 'Nizip tarlası',
      province: 'Gaziantep',
      district: 'Nizip',
      lat: 37.0,
      lon: 37.8,
      cropId: 'antep-fistigi',
      areaDecare: 20,
    },
  });
  expect(r1.status()).toBe(201);
  const r2 = await page.request.post(`${u.api}/fields`, {
    headers: h,
    data: {
      name: 'Konya ovası',
      province: 'Konya',
      district: 'Çumra',
      lat: 37.57,
      lon: 32.77,
      cropId: 'bugday',
      areaDecare: 50,
    },
  });
  expect(r2.status()).toBe(201);
  const konya = ((await r2.json()) as { id: string }).id;

  await page.goto('/');
  await page.getByTestId('alt-neeksem').click();
  await expect(page).toHaveURL(/\/ne-eksem$/);
  await expect(page.getByTestId('neeksem-ozet')).toBeVisible();
  await expect(page.getByTestId('neeksem-bolge')).toContainText('Gaziantep');
  await expect(page.getByText('Bilgi notu · uzman onayı bekliyor')).toBeVisible();
  await expect(page.getByTestId('neeksem-ozet')).toContainText('bilgi notudur');
  // Nizip: ayçiçeği açık + resmî planda → birinci.
  await expect(page.getByTestId('neeksem-urun-aycicegi')).toBeVisible();
  await expect(page.getByTestId('neeksem-urun-aycicegi')).toContainText('Resmî planda');
  await expect(page.getByTestId('neeksem-kisitli')).toContainText('Fındık');

  // Neden? ve niyet beyanı.
  await page.getByTestId('neeksem-urun-aycicegi').click();
  await expect(page.getByText('Neden bu sırada?')).toBeVisible();
  await page.getByTestId('neeksem-niyet-aycicegi').click();
  await page.getByTestId('neeksem-niyet-dekar').fill('99');
  await page.getByTestId('neeksem-niyet-gonder').click();
  await expect(page.getByText(/daha fazlasını beyan edemezsin/)).toBeVisible();
  await page.getByTestId('neeksem-niyet-dekar').fill('8');
  await page.getByTestId('neeksem-niyet-gonder').click();
  await expect(page.getByTestId('neeksem-niyetim-aycicegi')).toContainText('8 dekar');
  await expect(page.getByTestId('neeksem-urun-aycicegi')).toContainText('senin beyanın 8 dekar');

  // Tarla değiştir: Konya seçilince bölge yazısı değişir.
  await page.getByTestId(`neeksem-tarla-${konya}`).click();
  await expect(page.getByTestId('neeksem-tarla')).toHaveText('Konya ovası');
  await expect(page.getByTestId('neeksem-bolge')).toContainText('Konya');

  await page.getByTestId('neeksem-neden').click();
  await expect(page.getByText(/Hesap ve kaynaklar/)).toBeVisible();
  await expect(page.getByText(/TÜİK/).first()).toBeVisible();

  // Menüden de açılır.
  await page.goto('/');
  await page.getByTestId('ikon-menu').click();
  await page.getByTestId('menu-ne-eksem').click();
  await expect(page).toHaveURL(/\/ne-eksem$/);
});
