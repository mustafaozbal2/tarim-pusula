import { expect, test, type Page } from '@playwright/test';
import { base32Decode, hotp, totpStep } from '../../api/src/auth/totp';

/**
 * G5 kabul ölçütleri: panelde duyuru yaz > uzman onayla > mobilde görün; yetkisiz rol sayfayı göremez.
 * Panel `next start` ile 8112'de, mobil web paketi ve API 8111/3111'de çalışır.
 */
const PANEL = `http://127.0.0.1:${process.env['E2E_PANEL_PORT'] ?? 8112}`;

interface Staff {
  api: string;
  phone: string;
  token: string;
  userId: string;
}

const staff = async (page: Page, role: string) =>
  (await (await page.request.get(`/__e2e/staff?role=${role}`)).json()) as Staff;

/** Telefon + SMS kodu + doğrulayıcı kodu ile panele girer (ilk girişte anahtarı ekrandan okur). */
async function panelLogin(page: Page, phone: string) {
  await page.goto(`${PANEL}/giris`);
  await page.getByTestId('giris-tel').fill(phone);
  await page.getByTestId('giris-kod-iste').click();
  const otp = (await (
    await page.request.get(`/__e2e/otp?phone=${encodeURIComponent(phone)}`)
  ).json()) as {
    code: string;
  };
  await page.getByTestId('giris-sms').fill(otp.code);
  await page.getByTestId('giris-sms-gonder').click();
  const key = await page.getByTestId('giris-anahtar').innerText();
  const code = hotp(base32Decode(key.trim()), totpStep(new Date()));
  await page.getByTestId('giris-totp').fill(code);
  await page.getByTestId('giris-totp-gonder').click();
  await expect(page.getByRole('navigation', { name: 'Menü' })).toBeVisible();
}

test('duyuru yayınla > uzman onayla > mobilde görünür', async ({ browser }) => {
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileCtx.newPage();
  const instCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const instPage = await instCtx.newPage();
  const expertCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const expertPage = await expertCtx.newPage();

  // Çiftçi: Gaziantep'te Antep fıstığı tarlası, mobilde oturum açık.
  const farmer = (await (await mobile.request.get('/__e2e/user')).json()) as Staff;
  const created = await mobile.request.post(`${farmer.api}/fields`, {
    headers: { authorization: `Bearer ${farmer.token}` },
    data: {
      name: 'Nizip Fıstık Bahçesi',
      province: 'Gaziantep',
      district: 'Nizip',
      lat: 37.0105,
      lon: 37.794,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  await mobile.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [farmer.api, farmer.token],
  );

  // Kurum yöneticisi: panele girer, hedefli duyuru yazar.
  const inst = await staff(instPage, 'institution_admin');
  await panelLogin(instPage, inst.phone);
  const menu = instPage.getByRole('navigation', { name: 'Menü' });
  await expect(menu.getByText('Duyurular')).toBeVisible();
  await expect(menu.getByText('Onay kuyruğu')).toHaveCount(0); // rol bazlı menü
  await menu.getByRole('link', { name: 'Duyurular' }).click();
  await instPage.getByTestId('duyuru-kurum').fill('Gaziantep İl Tarım ve Orman Müdürlüğü');
  await instPage.getByTestId('duyuru-baslik').fill('Fıstık bahçeleri için bilgilendirme');
  await instPage.getByTestId('duyuru-metin').fill('Cuma günü il müdürlüğünde toplantı yapılacak.');
  await instPage.getByTestId('duyuru-il').selectOption('Gaziantep');
  await instPage.getByTestId('duyuru-urun').selectOption('antep-fistigi');
  await expect(instPage.getByTestId('duyuru-hedef')).toContainText('Gaziantep · Antep fıstığı');
  await instPage.getByTestId('duyuru-yayinla').click();
  await expect(instPage.getByText('Uzman onayı bekliyor').first()).toBeVisible();

  // Mobil: onaysız duyuru çiftçi ekranında hiçbir yerde görünmez (rozetsiz gizlenir).
  await mobile.goto('/');
  await expect(mobile.getByTestId('bugun-tarla')).toHaveText('Nizip Fıstık Bahçesi');
  await expect(mobile.getByText('Fıstık bahçeleri için bilgilendirme')).toHaveCount(0);
  await expect(mobile.getByText('Uzman onayı bekliyor')).toHaveCount(0);

  // Uzman: onay kuyruğundan onaylar.
  const expert = await staff(expertPage, 'expert');
  await panelLogin(expertPage, expert.phone);
  await expertPage
    .getByRole('navigation', { name: 'Menü' })
    .getByRole('link', { name: 'Onay kuyruğu' })
    .click();
  const item = expertPage.getByTestId('kuyruk-duyuru').filter({ hasText: 'Fıstık bahçeleri' });
  await expect(item).toBeVisible();
  await item.getByTestId('duyuru-onayla').click();
  await expect(expertPage.getByText('Duyuru onaylandı.')).toBeVisible();
  await expect(
    expertPage.getByTestId('kuyruk-duyuru').filter({ hasText: 'Fıstık bahçeleri' }),
  ).toHaveCount(0);

  // Mobil: onaydan sonra duyuru kart şeridinde görünür; karta dokununca kaynak kurum açılır.
  await mobile.reload();
  const card = mobile
    .getByTestId('kart-seridi-kart')
    .filter({ hasText: 'Fıstık bahçeleri için bilgilendirme' });
  await expect(card).toBeVisible();
  await expect(mobile.getByText('Uzman onayı bekliyor')).toHaveCount(0);
  await card.click();
  await expect(mobile.getByText('Gaziantep İl Tarım ve Orman Müdürlüğü').first()).toBeVisible();

  await Promise.all([mobileCtx.close(), instCtx.close(), expertCtx.close()]);
});

test('başka ilin duyurusu mobilde görünmez', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const farmer = (await (await page.request.get('/__e2e/user')).json()) as Staff;
  await page.request.post(`${farmer.api}/fields`, {
    headers: { authorization: `Bearer ${farmer.token}` },
    data: { name: 'Harran', province: 'Şanlıurfa', lat: 36.86, lon: 39.0, cropId: 'pamuk' },
  });
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [farmer.api, farmer.token],
  );
  await page.goto('/');
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Harran');
  await expect(page.getByTestId('kart-seridi-kart')).toHaveCount(0);
  await ctx.close();
});

test('yetkisiz rol sayfayı göremez', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // 1) Çiftçi (panel rolü yok): jetonu olsa bile girişe döner, içerik hiç çizilmez.
  const farmer = (await (await page.request.get('/__e2e/user')).json()) as Staff;
  await page.goto(`${PANEL}/giris`);
  await page.evaluate((t) => sessionStorage.setItem('panel.token', t), farmer.token);
  await page.goto(`${PANEL}/onay`);
  await expect(page).toHaveURL(/\/giris$/);
  await expect(page.getByTestId('kuyruk-bos')).toHaveCount(0);

  // 2) Giriş yapmamış kişi.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${PANEL}/duyurular`);
  await expect(page).toHaveURL(/\/giris$/);

  // 3) Kurum yöneticisi onay kuyruğunu ve denetim kaydını açamaz.
  const inst = await staff(page, 'institution_admin');
  await panelLogin(page, inst.phone);
  await page.goto(`${PANEL}/onay`);
  await expect(page.getByTestId('yetkisiz')).toBeVisible();
  await expect(page.getByTestId('kuyruk-bos')).toHaveCount(0);
  await page.goto(`${PANEL}/denetim`);
  await expect(page.getByTestId('yetkisiz')).toBeVisible();
  await ctx.close();
});
