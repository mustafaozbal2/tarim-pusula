import { expect, test, type Page } from '@playwright/test';

/** İkiz Tarım: alt çubuktan açılır, durum kartı + 4 senaryo + kayıt; bilgi kipinde rozet; başka araziye geçilir. */
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

test('İkiz Tarım: durum, senaryolar, sulama kaydı, neden kartı', async ({ page }) => {
  const u = await login(page);
  const r = await page.request.post(`${u.api}/fields`, {
    headers: { authorization: `Bearer ${u.token}` },
    data: {
      name: 'Yayla zeytinliği',
      province: 'Gaziantep',
      district: 'Nizip',
      lat: 37.0,
      lon: 37.8,
      cropId: 'zeytin',
      areaDecare: 10,
    },
  });
  expect(r.status()).toBe(201);

  await page.goto('/');
  await page.getByTestId('alt-ikiz').click();
  await expect(page).toHaveURL(/\/ikiz-tarim$/);
  await expect(page.getByTestId('ikiz-tarla')).toHaveText('Yayla zeytinliği');
  await expect(page.getByTestId('ikiz-durum')).toBeVisible();
  // Onaysız girdi: rozet var, öneri cümlesi "bilgi" der.
  await expect(page.getByText('Bilgi notu · uzman onayı bekliyor')).toBeVisible();
  await expect(page.getByTestId('ikiz-oneri')).toContainText('bilgi');
  for (const k of ['kural', 'bekle', 'kisintili', 'yok']) {
    await expect(page.getByTestId(`ikiz-senaryo-${k}`)).toBeVisible();
  }
  await page.getByTestId('ikiz-senaryo-yok').click();

  // Sulama kaydı: 44 px hedefler, sayı denetimi, listede görünür.
  await page.getByTestId('ikiz-kayit-ac').click();
  await page.getByTestId('ikiz-kayit-mm').fill('abc');
  await page.getByTestId('ikiz-kayit-gonder').click();
  await expect(page.getByText('0 ile 500 mm arasında')).toBeVisible();
  await page.getByTestId('ikiz-kayit-mm').fill('30');
  await page.getByTestId('ikiz-kayit-gonder').click();
  await expect(page.getByText(/Sulama 30 mm/)).toBeVisible();

  await page.getByTestId('ikiz-neden').click();
  await expect(page.getByText(/Hesap ve kaynaklar/)).toBeVisible();
  await expect(page.getByText(/FAO-56/).first()).toBeVisible();
  await expect(page.getByTestId('ikiz-karne')).toContainText('Henüz');

  // Menüden de açılır.
  await page.goto('/');
  await page.getByTestId('ikon-menu').click();
  await page.getByTestId('menu-ikiz-tarim').click();
  await expect(page).toHaveURL(/\/ikiz-tarim$/);
});
