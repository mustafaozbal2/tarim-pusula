import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * G2 kabul ölçütü: konum akışının dört yolu da (Tarladayım · Köyümü seçeyim · Haritada göstereyim ·
 * Yakınım yapsın) gerçek API'ye tarla kaydeder. Tarayıcıda web paketi, sunucuda süreç içi Postgres çalışır.
 */
interface TestUser {
  api: string;
  phone: string;
  token: string;
  userId: string;
}

// 1x1 yeşil PNG: dış ağdaki uydu karoları yerine (testler ağa bağlı değildir).
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/9sCzJgAAAABJRU5ErkJggg==',
  'base64',
);

async function newUser(page: Page): Promise<TestUser> {
  const r = await page.request.get('/__e2e/user');
  return (await r.json()) as TestUser;
}

async function openAs(
  browser: Browser,
  user: TestUser,
  opts: Parameters<Browser['newContext']>[0] = {},
) {
  const context = await browser.newContext(opts);
  await context.route('**/tiles.maps.eox.at/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE }),
  );
  await context.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  const page = await context.newPage();
  return { context, page };
}

async function fieldsOf(page: Page, user: TestUser) {
  const r = await page.request.get(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
  });
  return (await r.json()) as {
    name: string;
    lat: number;
    lon: number;
    province: string | null;
    village: string | null;
    cropId: string | null;
    locationSource: string;
    ownerId: string;
  }[];
}

/** Harita ekranında: işaret koy (gerekirse), "Evet, burası", ürün seç, kaydet. */
async function mapConfirmThenCropAndSave(page: Page, crop: string, name?: string) {
  await expect(page.getByTestId('tarla-isareti')).toBeVisible();
  await page.getByRole('button', { name: 'Evet, burası' }).click();
  await expect(page.getByRole('heading', { name: 'Ne ekili?' })).toBeVisible();
  await page.getByTestId(`urun-${crop}`).click();
  if (name) await page.getByTestId('tarla-adi').fill(name);
  await page.getByRole('button', { name: 'Kaydet' }).click();
}

async function clickMap(page: Page, dx = 0, dy = 0) {
  const box = (await page.getByTestId('harita').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 3 + dy);
}

test.describe('konum akışı (web)', () => {
  test('1) Tarladayım: GPS konumu, harita onayı, ürün, kayıt', async ({ browser, page }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user, {
      geolocation: { latitude: 37.0662, longitude: 37.3833, accuracy: 10 },
      permissions: ['geolocation'],
    });
    await p.goto('/tarla-ekle');
    await expect(p.getByRole('heading', { name: 'Tarlan nerede?' })).toBeVisible();
    await p.getByTestId('yol-gps').click();
    // İzin nedeni büyük yazıyla açıklanır
    await expect(p.getByTestId('gps-neden')).toContainText('Konumunu başka kimseyle paylaşmayız');
    await p.getByRole('button', { name: 'İzin ver ve bul' }).click();
    await expect(p.getByText('Tarlan burada mı?')).toBeVisible();
    await mapConfirmThenCropAndSave(p, 'antep-fistigi', 'Gazi tarlası');
    await expect(p.getByText('Gazi tarlası')).toBeVisible();

    const fields = await fieldsOf(p, user);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: 'Gazi tarlası',
      cropId: 'antep-fistigi',
      locationSource: 'gps',
    });
    expect(fields[0]!.lat).toBeCloseTo(37.0662, 4);
    expect(fields[0]!.lon).toBeCloseTo(37.3833, 4);
    await context.close();
  });

  test('1b) Tarladayım: izin reddedilirse köy listesine düşer', async ({ browser, page }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user, { permissions: [] });
    await p.goto('/tarla-ekle/gps');
    await p.getByRole('button', { name: 'İzin ver ve bul' }).click();
    await expect(p.getByRole('heading', { name: 'Köyünü seç' })).toBeVisible();
    await expect(p.getByText('Telefonun yeri alınamadı')).toBeVisible();
    await expect(p.getByText('Hangi ilde?')).toBeVisible();
    await context.close();
  });

  test('2) Köyümü seçeyim: il > ilçe > köy, harita onayı, kayıt', async ({ browser, page }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user);
    await p.goto('/tarla-ekle');
    await p.getByTestId('yol-koy').click();
    await p.getByRole('button', { name: 'Gaziantep' }).click();
    await expect(p.getByText('Hangi ilçe?')).toBeVisible();
    await p.getByRole('button', { name: 'Nizip', exact: true }).click();
    await expect(p.getByText('Hangi köy?')).toBeVisible();
    // Listedeki ilk köyü seç (başlık/geri dışındaki ilk büyük düğme)
    const first = p
      .getByRole('button')
      .filter({ hasText: /\S/ })
      .filter({ hasNotText: /Listede yok/ })
      .first();
    const villageName = (await first.innerText()).trim();
    await first.click();
    await expect(p.getByTestId('harita-yer')).toContainText(villageName);
    await mapConfirmThenCropAndSave(p, 'zeytin');
    await expect(p.getByTestId('tarla-karti')).toBeVisible();

    const fields = await fieldsOf(p, user);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      province: 'Gaziantep',
      village: villageName,
      cropId: 'zeytin',
      locationSource: 'koy',
    });
    expect(fields[0]!.lat).toBeGreaterThan(36.5);
    expect(fields[0]!.name).toBe(`${villageName} Bahçesi`);
    await context.close();
  });

  test('3) Haritada göstereyim: dokun, işaret, evet, kayıt', async ({ browser, page }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user);
    await p.goto('/tarla-ekle');
    await p.getByTestId('yol-harita').click();
    await expect(p.getByText('Tarlanın olduğu yere dokunarak işaret koy.')).toBeVisible();
    await expect(p.getByTestId('tarla-isareti')).toHaveCount(0);
    await p.getByTestId('yakinlas').click();
    await clickMap(p);
    await mapConfirmThenCropAndSave(p, 'pamuk');
    await expect(p.getByTestId('tarla-karti')).toBeVisible();

    const fields = await fieldsOf(p, user);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ cropId: 'pamuk', locationSource: 'harita' });
    // Türkiye haritasının ortasına yakın bir nokta
    expect(fields[0]!.lat).toBeGreaterThan(30);
    expect(fields[0]!.lat).toBeLessThan(45);
    await context.close();
  });

  test('3b) "Hayır, düzelt": işaret kalkar, yeniden dokununca yeni nokta', async ({
    browser,
    page,
  }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user);
    await p.goto('/tarla-ekle/harita');
    await clickMap(p);
    await expect(p.getByTestId('tarla-isareti')).toBeVisible();
    await p.getByRole('button', { name: 'Hayır, düzelt' }).click();
    await expect(p.getByTestId('tarla-isareti')).toHaveCount(0);
    await clickMap(p, 40, 30);
    await expect(p.getByTestId('tarla-isareti')).toBeVisible();
    await context.close();
  });

  test('4) Yakınım yapsın: kod, yakın ekler, çiftçi onaylar, tarla çiftçinin olur', async ({
    browser,
    page,
  }) => {
    const farmer = await newUser(page);
    const helper = await newUser(page);
    const f = await openAs(browser, farmer);
    const h = await openAs(browser, helper);

    // Çiftçi kod alır
    await f.page.goto('/tarla-ekle');
    await f.page.getByTestId('yol-yakin').click();
    await f.page.getByRole('button', { name: 'Kod al' }).click();
    const shown = (await f.page.getByTestId('yakin-kod').innerText()).replace(/\s/g, '');
    expect(shown).toMatch(/^\d{6}$/);
    await expect(f.page.getByText('Kod 24 saat geçerli')).toBeVisible();

    // Yakını kodu yazar, konumu haritada gösterir, ürünü seçer
    await h.page.goto('/tarla-ekle/yakin');
    await h.page.getByTestId('kodum-var').click();
    await h.page.getByTestId('kod-gir').fill(shown);
    await h.page.getByRole('button', { name: 'Devam' }).click();
    await expect(h.page.getByRole('heading', { name: 'Yakınının tarlası nerede?' })).toBeVisible();
    await expect(h.page.getByTestId('yol-yakin')).toHaveCount(0);
    await h.page.getByTestId('yol-harita').click();
    await clickMap(h.page);
    await mapConfirmThenCropAndSave(h.page, 'domates', 'Babamın bahçesi');
    await expect(h.page.getByText('Çiftçiye gönderildi')).toBeVisible();

    // Onaydan önce çiftçinin hesabında tarla yok
    expect(await fieldsOf(f.page, farmer)).toHaveLength(0);

    // Çiftçi onaylar
    await f.page.goto('/tarlalarim');
    await expect(f.page.getByText('Yakının bir tarla ekledi')).toBeVisible();
    await expect(f.page.getByTestId('oneri-ad')).toHaveText('Babamın bahçesi');
    await f.page.getByRole('button', { name: 'Onayla' }).click();
    await expect(f.page.getByTestId('tarla-karti')).toHaveText('Babamın bahçesi');

    const fields = await fieldsOf(f.page, farmer);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: 'Babamın bahçesi',
      ownerId: farmer.userId,
      cropId: 'domates',
      locationSource: 'yakin',
    });
    await f.context.close();
    await h.context.close();
  });

  test('4b) Yakınım yapsın: yanlış kod reddedilir', async ({ browser, page }) => {
    const helper = await newUser(page);
    const h = await openAs(browser, helper);
    await h.page.goto('/tarla-ekle/yakin-kod');
    await h.page.getByTestId('kod-gir').fill('000000');
    await h.page.getByRole('button', { name: 'Devam' }).click();
    await h.page.getByTestId('yol-harita').click();
    await clickMap(h.page);
    await mapConfirmThenCropAndSave(h.page, 'arpa');
    await expect(h.page.getByText('Kod geçersiz ya da süresi dolmuş')).toBeVisible();
    await h.context.close();
  });

  test('5) Çevrimdışı: kayıt sıraya alınır, bağlantı gelince bir kez gönderilir', async ({
    browser,
    page,
  }) => {
    const user = await newUser(page);
    const { context, page: p } = await openAs(browser, user);
    // Uygulama sayfaları parça parça yüklenir; çevrimdışına geçmeden önce tüm adımlar açılmış olmalı.
    await p.goto('/tarlalarim');
    await p.getByRole('button', { name: 'Tarla ekle' }).click();
    await p.getByTestId('yol-harita').click();
    await clickMap(p);
    await expect(p.getByTestId('tarla-isareti')).toBeVisible();
    await p.getByRole('button', { name: 'Evet, burası' }).click();
    await p.getByTestId('urun-arpa').click();
    await p.getByTestId('tarla-adi').fill('Sıradaki tarla');

    await context.setOffline(true);
    await p.getByRole('button', { name: 'Kaydet' }).click();
    await expect(p.getByText('Kaydedildi. İnternet gelince gönderilecek.')).toBeVisible();
    await expect(p.getByText('Gönderilmeyi bekliyor')).toBeVisible();

    await context.setOffline(false);
    await expect(p.getByTestId('tarla-karti')).toHaveText('Sıradaki tarla', { timeout: 40_000 });
    await expect(p.getByText('Gönderilmeyi bekliyor')).toHaveCount(0);

    const fields = await fieldsOf(p, user);
    expect(fields.filter((x) => x.name === 'Sıradaki tarla')).toHaveLength(1);
    await context.close();
  });

  test('giriş: telefon + SMS kodu', async ({ browser, page }) => {
    const context: BrowserContext = await browser.newContext();
    const p = await context.newPage();
    await p.addInitScript(
      (api) => localStorage.setItem('config.apiUrl', api),
      'http://127.0.0.1:3111',
    );
    await p.goto('/');
    await expect(p.getByRole('heading', { name: 'Telefonunla giriş yap' })).toBeVisible();
    await p.getByTestId('giris-telefon').fill('0532 700 99 99');
    await p.getByRole('button', { name: 'Kod gönder' }).click();
    const code = (
      (await (await page.request.get('/__e2e/otp?phone=%2B905327009999')).json()) as {
        code: string;
      }
    ).code;
    await p.getByTestId('giris-kod').fill(code);
    await p.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(
      p.getByRole('heading', { name: 'Tarlalarım' }).or(p.getByTestId('ana-bant')),
    ).toBeVisible();
    await context.close();
  });
});
