import { expect, test } from '@playwright/test';

/** Play/KVKK: uygulama içinden hesap silme. Onay sözcüğü olmadan silinmez; sonra oturum kapanır, eski belirteç geçersizdir. */
interface User {
  api: string;
  token: string;
}

test('Veri cüzdanı > Hesabı sil: SIL yazılmadan gönderilmez; silince giriş ekranı, eski belirteç geçersiz', async ({
  page,
}) => {
  const u = (await (await page.request.get('/__e2e/user')).json()) as User;
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [u.api, u.token],
  );
  await page.goto('/veri-cuzdani');
  await page.getByTestId('hesap-sil-ac').click();
  await page.getByTestId('hesap-sil-onay').fill('hayir');
  await page.getByTestId('hesap-sil-gonder').click();
  // Yanlış sözcük: hâlâ oturum açık, hesap duruyor.
  const hala = await page.request.get(`${u.api}/me/wallet`, {
    headers: { authorization: `Bearer ${u.token}` },
  });
  expect(hala.status()).toBe(200);
  await page.getByTestId('hesap-sil-onay').fill('SIL');
  await page.getByTestId('hesap-sil-gonder').click();
  await expect(page).toHaveURL(/\/giris/);
  const sonra = await page.request.get(`${u.api}/me/wallet`, {
    headers: { authorization: `Bearer ${u.token}` },
  });
  expect(sonra.status()).toBe(401);
});
