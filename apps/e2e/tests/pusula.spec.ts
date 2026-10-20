import { expect, test, type Page } from '@playwright/test';

/**
 * G7: Soru sor ekranı. Anahtarsız sahte sağlayıcıyla: doz isteği reddedilir ve BKÜ'ye yönlendirir,
 * kaynağı olmayan soru uydurma cevap yerine "uzmana soruldu" kartı verir.
 */
interface TestUser {
  api: string;
  token: string;
}

async function setup(page: Page) {
  const user = (await (await page.request.get('/__e2e/user')).json()) as TestUser;
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
}

async function ask(page: Page, question: string) {
  await page.goto('/soru-sor');
  await page.getByRole('button', { name: 'Yazarak sor' }).click();
  await page.getByTestId('soru-girdi').fill(question);
  await page.getByRole('button', { name: 'Sor', exact: true }).click();
}

test('Soru sor: ilaç dozu istenirse reddedilir ve BKÜ’ye yönlendirir', async ({ page }) => {
  await setup(page);
  await ask(page, 'Domatese dekara kaç ml fungisit atayım?');
  await expect(page.getByText('İlaç miktarını ben söyleyemem')).toBeVisible();
  await expect(page.getByTestId('pusula-karti')).toContainText('BKÜ');
  await expect(page.getByTestId('pusula-karti')).not.toContainText(/\d+\s*ml/);
  await expect(page.getByRole('button', { name: 'Sesli oku' })).toBeVisible();
  await page.getByRole('button', { name: 'Yeni soru sor' }).click();
  await expect(page.getByText('Ne öğrenmek istiyorsun?')).toBeVisible();
});

test('Soru sor: kaynağı olmayan soruda uydurma yok, uzmana sorulur', async ({ page }) => {
  await setup(page);
  await ask(page, 'Kayısı ağacının yaprakları neden sararıyor?');
  await expect(page.getByText('Uzmana soruldu').first()).toBeVisible();
  await expect(page.getByTestId('pusula-karti')).toContainText('Uzmana soruldu');
});
