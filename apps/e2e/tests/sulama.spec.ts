import { expect, test, type Page } from '@playwright/test';

/**
 * G8: Sulama ekranı. Onay > komut > ack zaman çizelgesi > durdur. Cihaz, süreç içi sanal ESP32'dir.
 */
interface TestUser {
  api: string;
  token: string;
  deviceId: string;
}

async function setup(page: Page) {
  const user = (await (await page.request.get('/__e2e/irrigation')).json()) as TestUser;
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  return user;
}

test('Sulama: onay iste, komut cihaza gitsin, onay gelsin, durdur', async ({ page }) => {
  const user = await setup(page);
  await page.goto(`/sulama?deviceId=${user.deviceId}`);
  await expect(page.getByTestId('vana-durum')).toContainText('Kapalı');

  await page.getByRole('button', { name: 'Sulamayı başlat' }).click();
  await expect(page.getByText('Vanayı açmak istiyor musun?')).toBeVisible();
  await page.getByRole('button', { name: '10 dk' }).click();
  await page.getByRole('button', { name: 'Başlat', exact: true }).click();

  await expect(page.getByTestId('vana-durum')).toContainText('Su akıyor');
  await expect(page.getByTestId('adim-acked')).toContainText('Cihaz onayladı');
  await expect(page.getByTestId('adim-result')).toContainText('Vana açık, akış başladı');
  await expect(page.getByTestId('vana-durum')).toContainText('azami 30 dk');

  await page.getByRole('button', { name: 'Durdur' }).click();
  await expect(page.getByTestId('vana-durum')).toContainText('Kapalı');
  await expect(page.getByRole('button', { name: 'Sulamayı başlat' })).toBeVisible();
});

test('Sulama: vazgeçersen hiçbir komut gitmez', async ({ page }) => {
  const user = await setup(page);
  await page.goto(`/sulama?deviceId=${user.deviceId}`);
  await page.getByRole('button', { name: 'Sulamayı başlat' }).click();
  await page.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(page.getByText('Vanayı açmak istiyor musun?')).toBeHidden();
  const status = await (
    await page.request.get(`${user.api}/devices/${user.deviceId}/status`, {
      headers: { authorization: `Bearer ${user.token}` },
    })
  ).json();
  expect(status.lastCommand).toBeNull();
});
