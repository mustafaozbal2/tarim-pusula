import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * G24 uçtan uca (tarayıcı): ilçe tarım uzmanı uygulamadan başvurur, yönetici onaylar, uzman
 * fotoğraflı duyuru yayınlar ve duyuru yalnız o ilçedeki çiftçiye düşer; çiftçinin fotoğraflı sorusu
 * bu uzmana gelir, uzmanın cevabı çiftçinin Sorularım ve Bildirimler ekranında görünür.
 */
const API = 'http://127.0.0.1:3111';
const PW = 'Tarla2026';
const PNG = resolve(import.meta.dirname, '../../mobile/assets/images/amblem.png');

async function json<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(path)).json()) as T;
}

async function asFarmer(page: Page, token: string) {
  await page.addInitScript(
    ([api, t]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', t!);
    },
    [API, token],
  );
}

test('ilçe uzmanı: başvuru -> onay -> fotoğraflı duyuru doğru çiftçiye; soru -> cevap -> bildirim', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = String(Date.now()).slice(-7);
  const staffPhone = `0533${suffix}`;
  const staffE164 = `+90533${suffix}`;

  // --- 1. Uzman başvurusu (uygulama içinden) ---
  const sctx = await browser.newContext();
  const s = await sctx.newPage();
  await s.addInitScript((api) => localStorage.setItem('config.apiUrl', api), API);
  await s.goto('/');
  await expect(s.getByRole('heading', { name: 'Hoş geldin' })).toBeVisible();
  await s.getByTestId('giris-yetkili').click();
  await s.getByTestId('yetkili-basvuru').click();
  await s.getByTestId('basvuru-kurum-ilce_mudurlugu').click();
  await s.getByTestId('basvuru-kurum-adi').fill('Şahinbey İlçe Tarım ve Orman Müdürlüğü');
  await s.getByTestId('basvuru-il').fill('Gazi');
  await s.getByTestId('basvuru-il-Gaziantep').click();
  await s.getByTestId('basvuru-ilce').fill('Şahin');
  await s.getByTestId('basvuru-ilce-Şahinbey').click();
  await s.getByTestId('basvuru-devam').click();
  await s.getByTestId('basvuru-ad').fill('Ayşe Uzman');
  await s.getByTestId('basvuru-unvan').fill('Ziraat mühendisi');
  await s.getByTestId('basvuru-sicil').fill('TB-2026-55');
  await s.getByTestId('basvuru-devam').click();
  await s.getByTestId('basvuru-telefon').fill(staffPhone);
  await s.getByTestId('basvuru-sifre').fill(PW);
  await s.getByTestId('basvuru-sifre2').fill(PW);
  await s.getByTestId('basvuru-kvkk').click();
  await s.getByTestId('basvuru-kod-gonder').click();
  await expect(s.getByTestId('basvuru-kod')).toBeVisible();
  const { code } = await json<{ code: string }>(
    page,
    `/__e2e/otp?phone=${encodeURIComponent(staffE164)}`,
  );
  await s.getByTestId('basvuru-kod').fill(code);
  await s.getByTestId('basvuru-gonder').click();
  await expect(s.getByTestId('yetkili-bekliyor')).toBeVisible();
  // Onaysız başvuruda duyuru kutusu yok.
  await expect(s.getByTestId('yetkili-duyuru-yeni')).toHaveCount(0);

  // --- 2. Yönetici onayı ---
  const admin = await json<{ token: string }>(page, '/__e2e/admin');
  const auth = { authorization: `Bearer ${admin.token}` };
  const apps = (await (await page.request.get(`${API}/panel/staff`, { headers: auth })).json()) as {
    userId: string;
    phone: string;
  }[];
  const mine = apps.find((a) => a.phone === staffE164)!;
  expect(mine).toBeTruthy();
  const d = await page.request.post(`${API}/panel/staff/${mine.userId}/decision`, {
    headers: auth,
    data: { approve: true },
  });
  expect(d.status()).toBe(200);

  // --- 3. Çiftçiler: biri Şahinbey'de, biri Şanlıurfa'da ---
  const farmer = await json<{ token: string }>(page, '/__e2e/user');
  const other = await json<{ token: string }>(page, '/__e2e/user');
  const mkField = async (token: string, body: object) =>
    (await (
      await page.request.post(`${API}/fields`, {
        headers: { authorization: `Bearer ${token}` },
        data: body,
      })
    ).json()) as { id: string };
  const field = await mkField(farmer.token, {
    name: 'Fıstık bahçesi',
    lat: 37.06,
    lon: 37.38,
    province: 'Gaziantep',
    district: 'Şahinbey',
    cropId: 'antep-fistigi',
  });
  const otherField = await mkField(other.token, {
    name: 'Urfa tarlası',
    lat: 37.16,
    lon: 38.79,
    province: 'Şanlıurfa',
    district: 'Haliliye',
    cropId: 'antep-fistigi',
  });

  // --- 4. Uzman fotoğraflı duyuru yayınlar ---
  await s.reload();
  await expect(s.getByTestId('yetkili-duyuru-yeni')).toBeVisible();
  await s.getByTestId('yetkili-duyuru-yeni').click();
  await expect(s.getByText('Şahinbey', { exact: false }).first()).toBeVisible();
  await s.getByTestId('duyuru-tur-onlem').click();
  const title = `Don uyarısı ${suffix}`;
  await s.getByTestId('duyuru-baslik').fill(title);
  await s
    .getByTestId('duyuru-metin')
    .fill('Bu gece don bekleniyor; sulama ve örtü hazırlığı yapın.');
  const chooser = s.waitForEvent('filechooser');
  await s.getByTestId('duyuru-foto').click();
  await (await chooser).setFiles(PNG);
  await expect(s.getByRole('button', { name: 'Fotoğrafı kaldır' })).toBeVisible();
  await s.getByTestId('duyuru-yayinla').click();
  await expect(s.getByText('Duyuru yayında.', { exact: false })).toBeVisible();

  // Yalnız Şahinbey'deki çiftçiye düşer; görseli ile.
  const anns = async (token: string, fieldId: string) =>
    (
      (await (
        await page.request.get(`${API}/fields/${fieldId}/announcements`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).json()) as { announcements: { title: string; imageDataUrl?: string | null }[] }
    ).announcements;
  const got = (await anns(farmer.token, field.id)).find((a) => a.title === title);
  expect(got).toBeTruthy();
  expect(got!.imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  expect((await anns(other.token, otherField.id)).some((a) => a.title === title)).toBe(false);

  const fctx = await browser.newContext();
  const f = await fctx.newPage();
  await asFarmer(f, farmer.token);
  await f.goto('/bildirimler');
  await expect(f.getByText(title)).toBeVisible();

  // --- 5. Çiftçinin fotoğraflı sorusu bu uzmana gelir ---
  const ask = await page.request.post(`${API}/pusula/ask`, {
    headers: { authorization: `Bearer ${farmer.token}` },
    data: {
      question: 'Fıstık yapraklarında sarı lekeler var, ne olabilir?',
      fieldId: field.id,
      image: {
        mime: 'image/png',
        base64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
    },
  });
  const qid = ((await ask.json()) as { card: { expertQuestionId: string } }).card.expertQuestionId;
  expect(qid).toBeTruthy();

  await s.goto('/yetkili/sorular');
  await expect(s.getByTestId(`soru-${qid}`)).toContainText('Sana yönlendirildi');
  await s.getByTestId(`ac-${qid}`).click();
  await expect(s.getByLabel('Çiftçinin fotoğrafı')).toBeVisible();
  const answer = 'Yaprak lekesine benziyor; ilçe müdürlüğüne yaprak örneği getirin.';
  await s.getByTestId(`cevap-${qid}`).fill(answer);
  await s.getByTestId(`kaynak-${qid}`).fill('Şahinbey İlçe Tarım, saha gözlemi');
  await s.getByTestId(`gonder-${qid}`).click();
  await expect(s.getByText('Cevap çiftçiye gitti', { exact: false })).toBeVisible();

  // --- 6. Çiftçi cevabı görür; bildirim kutusunda da var ---
  await f.goto('/sorularim');
  await expect(f.getByTestId(`sorum-${qid}`)).toContainText(answer);
  await expect(f.getByTestId(`sorum-${qid}`)).toContainText('Cevaplandı');
  await f.goto('/bildirimler');
  await expect(f.getByTestId('bildirim-listesi')).toContainText('cevap', { ignoreCase: true });

  await sctx.close();
  await fctx.close();
});

test('çiftçi: kayıt (telefon + şifre + SMS) ve sonra şifreyle giriş', async ({ browser, page }) => {
  const suffix = String(Date.now()).slice(-7);
  const phone = `0534${suffix}`;
  const e164 = `+90534${suffix}`;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.addInitScript((api) => localStorage.setItem('config.apiUrl', api), API);
  await p.goto('/');
  await p.getByTestId('giris-ciftci').click();
  await p.getByTestId('giris-kayit').click();
  await p.getByTestId('kayit-ad').fill('Mehmet Çiftçi');
  await p.getByTestId('kayit-telefon').fill(phone);
  await p.getByTestId('kayit-sifre').fill('kisa');
  await p.getByTestId('kayit-sifre2').fill('kisa');
  await p.getByTestId('kayit-kvkk').click();
  await p.getByTestId('kayit-kod-gonder').click();
  await expect(p.getByRole('alert')).toContainText('Şifre en az 8 karakter');
  await p.getByTestId('kayit-sifre').fill(PW);
  await p.getByTestId('kayit-sifre2').fill(PW);
  await p.getByTestId('kayit-kod-gonder').click();
  const { code } = await json<{ code: string }>(
    page,
    `/__e2e/otp?phone=${encodeURIComponent(e164)}`,
  );
  await p.getByTestId('kayit-kod').fill(code);
  await p.getByTestId('kayit-bitir').click();
  await expect(
    p.getByRole('heading', { name: 'Tarlalarım' }).or(p.getByTestId('ana-bant')),
  ).toBeVisible();
  await ctx.close();

  // Yeni cihaz: şifreyle giriş (SMS gerekmez).
  const ctx2 = await browser.newContext();
  const q = await ctx2.newPage();
  await q.addInitScript((api) => localStorage.setItem('config.apiUrl', api), API);
  await q.goto('/giris/ciftci');
  await q.getByTestId('giris-telefon').fill(phone);
  await q.getByTestId('giris-sifre').fill('YanlisSifre1');
  await q.getByTestId('giris-gir').click();
  await expect(q.getByRole('alert')).toBeVisible();
  await q.getByTestId('giris-sifre').fill(PW);
  await q.getByTestId('giris-gir').click();
  await expect(
    q.getByRole('heading', { name: 'Tarlalarım' }).or(q.getByTestId('ana-bant')),
  ).toBeVisible();
  await ctx2.close();
});
