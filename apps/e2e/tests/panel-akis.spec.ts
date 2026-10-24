import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { base32Decode, hotp, totpStep } from '../../api/src/auth/totp';

/**
 * G17: yeniden tasarlanan kurum paneli. Akış: duyuru oluştur > düzenle > onayla > mobilde görünür > sil.
 * Ayrıca: "Tümü" açık seçenek, ana sayfa özeti, gruplu menü, reddet, onayı geri çek, MFA sıfırla,
 * ekran görüntüleri (docs/gorsel/panel-*.png) ve docs/gorsel/PANEL_KARSILASTIRMA.md.
 */
const PANEL = `http://127.0.0.1:${process.env['E2E_PANEL_PORT'] ?? 8112}`;
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel');

interface Staff {
  api: string;
  phone: string;
  token: string;
  userId: string;
}
const staff = async (page: Page, role: string) =>
  (await (await page.request.get(`/__e2e/staff?role=${role}`)).json()) as Staff;

async function panelLogin(page: Page, phone: string) {
  await page.goto(`${PANEL}/giris`);
  await page.getByTestId('giris-tel').fill(phone);
  await page.getByTestId('giris-kod-iste').click();
  const otp = (await (
    await page.request.get(`/__e2e/otp?phone=${encodeURIComponent(phone)}`)
  ).json()) as { code: string };
  await page.getByTestId('giris-sms').fill(otp.code);
  await page.getByTestId('giris-sms-gonder').click();
  const key = await page.getByTestId('giris-anahtar').innerText();
  await page.getByTestId('giris-totp').fill(hotp(base32Decode(key.trim()), totpStep(new Date())));
  await page.getByTestId('giris-totp-gonder').click();
  await expect(page.getByRole('navigation', { name: 'Menü' })).toBeVisible();
}

const menuLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Menü' }).getByRole('link', { name, exact: true });

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('duyuru oluştur > düzenle > onayla > mobilde görünür > sil', async ({ browser }) => {
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileCtx.newPage();
  const instCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const inst = await instCtx.newPage();
  const expertCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const expert = await expertCtx.newPage();

  // Çiftçi: Aydın / Efeler'de zeytin tarlası (bu teste özgü yer; diğer testlerin duyurularıyla karışmaz).
  const farmer = (await (await mobile.request.get('/__e2e/user')).json()) as Staff;
  const created = await mobile.request.post(`${farmer.api}/fields`, {
    headers: { authorization: `Bearer ${farmer.token}` },
    data: {
      name: 'Efeler Zeytinliği',
      province: 'Aydın',
      district: 'Efeler',
      lat: 37.84,
      lon: 27.84,
      cropId: 'zeytin',
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

  // 1) Oluştur (görselli, hedef: Aydın / Tümü ilçe / tüm ürünler)
  const i = await staff(inst, 'institution_admin');
  await panelLogin(inst, i.phone);
  await menuLink(inst, 'Duyurular').click();
  await expect(inst.getByTestId('duyuru-il')).toHaveValue(''); // varsayılan: Tümü
  await expect(inst.getByTestId('duyuru-il').locator('option').first()).toHaveText('Tümü');
  await inst.getByTestId('duyuru-kurum').fill('Aydın İl Tarım ve Orman Müdürlüğü');
  await inst.getByTestId('duyuru-baslik').fill('Zeytinde kış budaması');
  await inst.getByTestId('duyuru-metin').fill('Budama için uygun dönem başladı.');
  // canlı önizleme
  await expect(inst.getByTestId('onizleme-baslik')).toHaveText('Zeytinde kış budaması');
  await expect(inst.getByTestId('onizleme-metin')).toContainText('Budama için uygun dönem');
  await inst.getByTestId('duyuru-gorsel').setInputFiles({
    name: 'bahce.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(inst.getByTestId('onizleme-gorsel')).toBeVisible();
  await inst.getByTestId('duyuru-il').selectOption('Aydın');
  await expect(inst.getByTestId('duyuru-hedef')).toHaveText('Hedef: Aydın · tüm ürünler');
  await inst.getByTestId('duyuru-yayinla').click();
  await expect(inst.getByText('Duyuru kaydedildi')).toBeVisible();

  const row = () =>
    inst.getByTestId('duyuru-liste-satir').filter({ hasText: 'Zeytinde kış budaması' });
  await expect(row()).toContainText('Uzman onayı bekliyor');
  await expect(row()).toContainText('Aydın · tüm ürünler');

  // 2) Düzenle: başlık değişir, görsel korunur, onay sıfırlanır
  await row().getByTestId('duyuru-duzenle').click();
  await expect(inst.getByTestId('duyuru-baslik')).toHaveValue('Zeytinde kış budaması');
  await expect(inst.getByTestId('onizleme-gorsel')).toBeVisible();
  await inst.getByTestId('duyuru-baslik').fill('Zeytinde kış budaması (güncel)');
  await inst.getByTestId('duyuru-yayinla').click();
  await expect(inst.getByText('Duyuru güncellendi')).toBeVisible();
  await expect(
    inst.getByTestId('duyuru-liste-satir').filter({ hasText: 'Zeytinde kış budaması (güncel)' }),
  ).toBeVisible();

  // Mobil: taslak olarak rozetli görünür (satıra dokununca ayrıntı + görsel)
  await mobile.goto('/');
  const news = mobile.getByTestId('bugun-duyurular');
  await expect(news).toContainText('Zeytinde kış budaması (güncel)');
  await expect(news).toContainText('Uzman onayı bekliyor');
  await news.getByTestId('liste-satiri').filter({ hasText: 'güncel' }).click();
  await expect(news.getByTestId('duyuru-gorsel')).toBeVisible();

  // 3) Uzman onaylar
  const e = await staff(expert, 'expert');
  await panelLogin(expert, e.phone);
  await menuLink(expert, 'Onay kuyruğu').click();
  const item = expert.getByTestId('kuyruk-duyuru').filter({ hasText: 'güncel' });
  await item.getByTestId('duyuru-onayla').click();
  await expect(expert.getByText('Duyuru onaylandı.')).toBeVisible();

  // 4) Mobilde rozetsiz görünür
  await mobile.reload();
  await expect(mobile.getByTestId('bugun-duyurular')).toContainText(
    'Zeytinde kış budaması (güncel)',
  );
  await expect(mobile.getByTestId('bugun-duyurular')).not.toContainText('Uzman onayı bekliyor');

  // 5) Onayı geri çek (gerekçeli): yeniden rozetli
  const approved = expert.getByTestId('onayli-duyuru').filter({ hasText: 'güncel' });
  await approved.getByTestId('duyuru-geri-cek').click();
  await expect(expert.getByTestId('onay-tamam')).toBeDisabled(); // gerekçe zorunlu
  await expert.getByTestId('onay-gerekce').fill('Tarih bilgisi hatalı');
  await expert.getByTestId('onay-tamam').click();
  await expect(expert.getByText('Onay geri çekildi')).toBeVisible();
  await mobile.reload();
  await expect(mobile.getByTestId('bugun-duyurular')).toContainText('Uzman onayı bekliyor');

  // 6) Sil: onay penceresi, vazgeçince kalır, onaylayınca gider
  await inst.reload();
  await row().first().waitFor();
  const target = inst
    .getByTestId('duyuru-liste-satir')
    .filter({ hasText: 'Zeytinde kış budaması (güncel)' });
  await target.getByTestId('duyuru-sil').click();
  await expect(inst.getByTestId('onay-penceresi')).toContainText('Duyuru silinsin mi?');
  await inst.getByTestId('onay-vazgec').click();
  await expect(target).toBeVisible();
  await target.getByTestId('duyuru-sil').click();
  await inst.getByTestId('onay-tamam').click();
  await expect(inst.getByText('Duyuru silindi')).toBeVisible();
  await expect(target).toHaveCount(0);

  // Mobil: silinen duyuru kalmadı
  await mobile.reload();
  await expect(mobile.getByTestId('bugun-duyurular')).toHaveCount(0);

  await Promise.all([mobileCtx.close(), instCtx.close(), expertCtx.close()]);
});

test('reddet: gerekçe ister, reddedilen duyuru çiftçiye hiç gösterilmez', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const inst = await staff(page, 'institution_admin');
  await panelLogin(page, inst.phone);
  await menuLink(page, 'Duyurular').click();
  await page.getByTestId('duyuru-kurum').fill('Mardin İl Müdürlüğü');
  await page.getByTestId('duyuru-baslik').fill('Hatalı duyuru örneği');
  await page.getByTestId('duyuru-metin').fill('Bu duyuru reddedilecek.');
  await page.getByTestId('duyuru-il').selectOption('Mardin');
  await page.getByTestId('duyuru-yayinla').click();
  await expect(page.getByText('Duyuru kaydedildi')).toBeVisible();

  const ex = await staff(page, 'expert');
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ep = await ectx.newPage();
  await panelLogin(ep, ex.phone);
  await menuLink(ep, 'Onay kuyruğu').click();
  const item = ep.getByTestId('kuyruk-duyuru').filter({ hasText: 'Hatalı duyuru örneği' });
  await item.getByTestId('duyuru-reddet').click();
  await expect(ep.getByTestId('onay-tamam')).toBeDisabled();
  await ep.getByTestId('onay-gerekce').fill('Kaynak belgesi eksik');
  await ep.getByTestId('onay-tamam').click();
  await expect(ep.getByText('Duyuru reddedildi.')).toBeVisible();
  await expect(item).toHaveCount(0);
  // Panelde "Reddedildi" olarak görünür
  await page.reload();
  await expect(
    page.getByTestId('duyuru-liste-satir').filter({ hasText: 'Hatalı duyuru örneği' }),
  ).toContainText('Reddedildi');
  await Promise.all([ctx.close(), ectx.close()]);
});

test('yönetici: gruplu menü, özet kartları, liste ekranları, MFA sıfırla + ekran görüntüleri', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  mkdirSync(OUT, { recursive: true });

  // Kurum yöneticisi önce giriş yapıp ikinci adımı kursun (sıfırlanacak kişi).
  const victimCtx = await browser.newContext();
  const victimPage = await victimCtx.newPage();
  const victim = await staff(victimPage, 'institution_admin');
  await panelLogin(victimPage, victim.phone);
  await victimCtx.close();

  const a = await staff(page, 'admin');
  await panelLogin(page, a.phone);
  const nav = page.getByRole('navigation', { name: 'Menü' });
  await expect(nav).toHaveCSS('background-color', 'rgb(6, 77, 59)'); // #064D3B
  for (const g of ['Arazi işlemleri', 'Üretim planlama', 'Duyuru ve içerik']) {
    await expect(nav.getByRole('button', { name: g })).toHaveAttribute('aria-expanded', 'true');
  }
  for (const l of [
    'Ana sayfa',
    'Arazi listele',
    'Ürün arz talep',
    'Verim haritası',
    'Desteklenen ürünler',
    'Duyurular',
    'Onay kuyruğu',
    'Bitki paketleri (Kc)',
    'Toprak türleri',
    'Soru / uzman kuyruğu',
    'Cihazlar',
    'Denetim kaydı',
    'Kullanıcılar',
  ]) {
    await expect(menuLink(page, l)).toBeVisible();
  }
  // açılır grup
  await nav.getByRole('button', { name: 'Üretim planlama' }).click();
  await expect(menuLink(page, 'Verim haritası')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Üretim planlama' }).click();
  await expect(menuLink(page, 'Verim haritası')).toBeVisible();

  // Üst çubuk: breadcrumb, kullanıcı, çıkış
  await expect(page.getByTestId('ust-yol')).toHaveText('Ana sayfa');
  await expect(page.getByTestId('ust-kullanici')).toHaveText('Yönetici');
  await expect(page.getByRole('button', { name: 'Çıkış yap' })).toBeVisible();

  // Ana sayfa: özet kartları + son işlemler
  await expect(page.getByTestId('ozet-duyuru')).toBeVisible();
  await expect(page.getByTestId('ozet-bekleyen')).toBeVisible();
  await expect(page.getByTestId('ozet-tarla')).toBeVisible();
  await expect(page.getByTestId('ozet-cihaz')).toBeVisible();
  await expect(page.getByTestId('son-islemler')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, 'panel-ana-sayfa.png') });

  const shots: { name: string; title: string; link: string; ready: string; trail: string }[] = [
    {
      name: 'panel-arazi',
      title: 'Arazi listele',
      link: 'Arazi listele',
      ready: 'Kayıtlı araziler',
      trail: 'Ana sayfa › Arazi işlemleri › Arazi listele',
    },
    {
      name: 'panel-arz-talep',
      title: 'Ürün arz talep',
      link: 'Ürün arz talep',
      ready: 'Arz ve talep verisi',
      trail: 'Ana sayfa › Üretim planlama › Ürün arz talep',
    },
    {
      name: 'panel-verim',
      title: 'Verim haritası',
      link: 'Verim haritası',
      ready: 'Verim haritası henüz',
      trail: 'Ana sayfa › Üretim planlama › Verim haritası',
    },
    {
      name: 'panel-urunler',
      title: 'Desteklenen ürünler',
      link: 'Desteklenen ürünler',
      ready: 'ürün ·',
      trail: 'Ana sayfa › Üretim planlama › Desteklenen ürünler',
    },
    {
      name: 'panel-duyurular',
      title: 'Duyurular (form + önizleme + liste)',
      link: 'Duyurular',
      ready: 'Yazılan duyurular',
      trail: 'Ana sayfa › Duyuru ve içerik › Duyurular',
    },
    {
      name: 'panel-onay',
      title: 'Onay kuyruğu',
      link: 'Onay kuyruğu',
      ready: 'Yayındaki duyurular',
      trail: 'Ana sayfa › Duyuru ve içerik › Onay kuyruğu',
    },
    {
      name: 'panel-paketler',
      title: 'Bitki paketleri (Kc)',
      link: 'Bitki paketleri (Kc)',
      ready: 'Bitki türü ve Kc',
      trail: 'Ana sayfa › Bitki paketleri (Kc)',
    },
    {
      name: 'panel-toprak',
      title: 'Toprak türleri',
      link: 'Toprak türleri',
      ready: 'Toprak türü ve su tutma',
      trail: 'Ana sayfa › Toprak türleri',
    },
    {
      name: 'panel-uzman',
      title: 'Soru / uzman kuyruğu',
      link: 'Soru / uzman kuyruğu',
      ready: 'Bekleyen sorular',
      trail: 'Ana sayfa › Soru / uzman kuyruğu',
    },
    {
      name: 'panel-cihazlar',
      title: 'Cihazlar',
      link: 'Cihazlar',
      ready: 'cihaz',
      trail: 'Ana sayfa › Cihazlar',
    },
    {
      name: 'panel-denetim',
      title: 'Denetim kaydı',
      link: 'Denetim kaydı',
      ready: 'Son işlemler',
      trail: 'Ana sayfa › Denetim kaydı',
    },
    {
      name: 'panel-kullanicilar',
      title: 'Kullanıcılar',
      link: 'Kullanıcılar',
      ready: 'Panel personeli',
      trail: 'Ana sayfa › Kullanıcılar',
    },
  ];
  for (const s of shots) {
    await menuLink(page, s.link).click();
    await expect(page.getByText(s.ready, { exact: false }).first()).toBeVisible();
    await expect(page.getByTestId('ust-yol')).toHaveText(s.trail);
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `${s.name}.png`) });
  }

  // Belirsiz "boş bırakırsanız hepsi" metni yok; "Tümü" açık seçenek
  await menuLink(page, 'Duyurular').click();
  await expect(page.getByTestId('duyuru-il')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/boş bırak/i);
  expect(body).not.toMatch(/boşsa/i);
  for (const id of ['duyuru-il', 'duyuru-ilce', 'duyuru-koy', 'duyuru-urun']) {
    await expect(page.getByTestId(id).locator('option').first()).toHaveText('Tümü');
  }

  // Liste: arama, sıralama, sayfalama çalışır (denetim kaydı)
  await menuLink(page, 'Denetim kaydı').click();
  await expect(page.getByTestId('denetim-liste-toplam')).toContainText('kayıt · sayfa 1/');
  await page.getByTestId('denetim-liste-ara').fill('Kullanıcı listesi');
  await expect(page.getByTestId('denetim-liste-toplam')).toContainText('sayfa 1/1');

  // MFA sıfırla (kullanıcılar)
  await menuLink(page, 'Kullanıcılar').click();
  const urow = page.getByTestId('kullanici-liste-satir').filter({ hasText: '*** **' });
  await expect(urow.first()).toBeVisible();
  const victimRow = page
    .getByTestId('kullanici-liste-satir')
    .filter({ hasText: 'Kurum yöneticisi' })
    .filter({ hasText: 'Kurulu' })
    .first();
  await victimRow.getByTestId('mfa-sifirla').click();
  await expect(page.getByTestId('onay-penceresi')).toContainText('İkinci adım sıfırlansın mı?');
  await page.getByTestId('onay-tamam').click();
  await expect(page.getByText('İkinci adım sıfırlandı.')).toBeVisible();
  await expect(
    page.getByTestId('kullanici-liste-satir').filter({ hasText: 'Kurulmamış' }).first(),
  ).toBeVisible();
  // tam telefon numarası hiçbir satırda yok
  expect(await page.getByTestId('kullanici-liste').innerText()).not.toMatch(/\+905\d{9}/);

  const md = `# Panel görsel karşılaştırma (G17)

Üreten: \`apps/e2e/tests/panel-akis.spec.ts\` (Playwright, 1280×800). Referans: eski uygulamanın yönetim paneli
(docs/referans/eski_uygulama_slayt10.jpg, slayt12.jpg): solda koyu yeşil (#064D3B) kenar menü, üstte breadcrumb,
beyaz form/tablo kartları, etiketli sıkı alanlar, sağ-altta eylem düğmeleri.

![Eski panel (slayt 10)](../referans/eski_uygulama_slayt10.jpg)
![Eski Kc/toprak listeleri (slayt 12)](../referans/eski_uygulama_slayt12.jpg)

| Ekran | Yeni panel |
| --- | --- |
| Ana sayfa (özet kartları + son işlemler) | ![ana sayfa](./panel-ana-sayfa.png) |
${shots.map((s) => `| ${s.title} | ![${s.name}](./${s.name}.png) |`).join('\n')}
`;
  writeFileSync(resolve(OUT, 'PANEL_KARSILASTIRMA.md'), md);
  await ctx.close();
});
