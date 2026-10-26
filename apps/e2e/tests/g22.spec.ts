import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * G22: boş durum, ürüne göre örnek içerik (5 kart + her sekmede 5 satır), hedef görselle ölçü
 * karşılaştırması (sapma < 2 px) ve ikon sayfalarının "yalnız Yükleniyor" kalmaması.
 * Ekran görüntüleri: docs/gorsel/ (ana sayfa) ve docs/gorsel/IKON_SAYFALARI/.
 */
const DOCS = resolve(import.meta.dirname, '../../../docs/gorsel');
const ICONS_OUT = resolve(DOCS, 'IKON_SAYFALARI');

interface User {
  api: string;
  token: string;
}

async function login(page: Page): Promise<User> {
  const user = (await (await page.request.get('/__e2e/user')).json()) as User;
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
  return user;
}

async function addField(
  page: Page,
  u: User,
  name: string,
  cropId: string,
  district: string,
  province = 'Kahramanmaraş',
) {
  const r = await page.request.post(`${u.api}/fields`, {
    headers: { authorization: `Bearer ${u.token}` },
    // Duyuru tohumları Gaziantep'e hedefli; ürün içeriğini ayrı sınamak için başka il.
    data: { name, province, district, lat: 37.58, lon: 36.94, cropId },
  });
  expect(r.status()).toBe(201);
}

const rows = (page: Page) => page.getByTestId('ana-sekmeli-kart').getByTestId('liste-satiri');

test('G22.3 boş durum: tarla yokken içerik yok, kısa metin + Tarla ekle', async ({ page }) => {
  await login(page);
  await page.goto('/');
  const empty = page.getByTestId('ana-bos-durum');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('Şu anda gösterilecek bir şey yok. Tarla ekleyin.');
  await expect(page.getByTestId('ana-tarla-ekle')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId('kart-seridi-kart')).toHaveCount(0);
  await expect(page.getByTestId('bugun-tarla')).toHaveCount(0);
  await expect(page.getByTestId('dikkat-rozeti')).toHaveCount(0);
  // 7 ikon ve amblem yine görünür (gezinme bozulmaz).
  await expect(page.getByTestId('amblem')).toBeVisible();
  await expect(page.getByTestId('ikon-hava')).toBeVisible();
  mkdirSync(DOCS, { recursive: true });
  await page.screenshot({ path: resolve(DOCS, 'anasayfa_bos_durum.png') });
  await page.getByTestId('ana-tarla-ekle').click();
  await expect(page).toHaveURL(/\/tarla-ekle/);
});

test('G22.4-5 ürüne göre içerik: Antep fıstığı, zeytin, domates', async ({ page }) => {
  const u = await login(page);
  await page.goto('/');
  await expect(page.getByTestId('ana-bos-durum')).toBeVisible();

  await addField(page, u, 'Burç Fıstık Bahçesi', 'antep-fistigi', 'Şehitkamil');
  await page.reload();
  await expect(page.getByTestId('bugun-tarla')).toHaveText('Burç Fıstık Bahçesi');
  await expect(page.getByTestId('ana-bos-durum')).toHaveCount(0);

  // Slider: 5 kart, görselleri gerçekten yüklü (boş/"fotoğraf yok" yok).
  await expect(page.getByTestId('kart-seridi-kart')).toHaveCount(5);
  for (let i = 1; i <= 5; i++) {
    const loaded = await page
      .getByTestId(`kart-gorsel-${i}`)
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(loaded).toBe(true);
  }
  await expect(page.getByText(/fotoğraf yok/i)).toHaveCount(0);

  const check = async (word: string) => {
    for (const tab of ['zaman', 'rehber', 'uyari', 'hibe'] as const) {
      await page.getByTestId(`sekme-${tab}`).click();
      await expect(rows(page)).toHaveCount(5);
    }
    // Onaylı gerçek takvim kaydı (başka testlerden) önce gelebilir; örnek satırlar ürüne göredir.
    await page.getByTestId('sekme-zaman').click();
    await expect(rows(page).filter({ hasText: word }).first()).toBeVisible();
    // Hepsi: dört sekmenin birleşimi (takvimden türeyen rehber satırı zamanı tekrar etmez).
    await page.getByTestId('sekme-hepsi').click();
    await expect.poll(() => rows(page).count()).toBeGreaterThanOrEqual(15);
    expect(await rows(page).count()).toBeLessThanOrEqual(20);
    // 5 kartın 4'ü ürün adını taşır (4. kart genel: "İklim krizi gıda krizinin habercisi").
    await expect(page.getByTestId('kart-seridi-kart').filter({ hasText: word })).toHaveCount(4);
  };
  await check('Antep fıstığı');

  // Satır detayında kaynak + tarih etiketi ("Örnek veri (demo)").
  await rows(page).filter({ hasText: 'Antep fıstığı' }).first().click();
  await expect(page.getByTestId('satir-detay')).toContainText('Örnek veri (demo)');

  // Ürün değişince içerik değişir.
  await addField(page, u, 'Yayla Zeytinliği', 'zeytin', 'Nizip');
  await addField(page, u, 'Domates Tarlası', 'domates', 'Oğuzeli');
  for (const [name, word] of [
    ['Yayla Zeytinliği', 'Zeytin'],
    ['Domates Tarlası', 'Domates'],
  ] as const) {
    await page.reload();
    await page.getByTestId('arazi-blogu').click();
    await page.getByTestId('arazi-secici').getByText(name, { exact: true }).click();
    await expect(page.getByTestId('bugun-tarla')).toHaveText(name);
    await check(word);
    await expect(page.getByText('Antep fıstığı', { exact: false })).toHaveCount(0);
  }
});

/**
 * Hedef görselden (docs/referans/anasayfa_hedef.png, telefon ekranı x 322..951 = 630 px → 390 px)
 * piksel örneklemesiyle ölçülen kutular. Yöntem: docs/gorsel/ANASAYFA_FARK.md.
 * G23 (Mustafa, 26 Ekim): ikonlar (39,6 → 42) ve slayt kartları (71x119,5 → 76x136) "bir tık" büyütüldü;
 * amblem ve bant hedefteki gibi kalır, alttaki öğeler kart büyümesi kadar (17,2 px) aşağı kayar.
 */
const TARGET: Record<string, { x: number; y: number; w: number; h: number; label: string }> = {
  amblem: { x: 6.7, y: 2.8, w: 77, h: 97, label: 'Amblem (TARIM PUSULA yazısı dahil)' },
  'ikon-gorsel-arazilerim': { x: 84.8, y: 25.1, w: 42, h: 42, label: 'İkon 1 (Arazilerim)' },
  'ikon-gorsel-ayarlar': { x: 344, y: 25.1, w: 42, h: 42, label: 'İkon 7 (Profil Ayarları)' },
  'kart-gorsel-1': { x: 7.4, y: 141.1, w: 76, h: 136, label: 'Kart 1 görseli' },
  'kart-gorsel-2': { x: 89.4, y: 141.1, w: 76, h: 136, label: 'Kart 2 görseli' },
  ciftci: { x: 84.3, y: 314.1, w: 53, h: 104, label: 'Çiftçi görseli' },
  'ana-sekme-basligi': { x: 8.7, y: 425.8, w: 373.9, h: 52.6, label: 'Sekme başlığı' },
  'tarih-kutusu': { x: 17.3, y: 485.8, w: 61.3, h: 61.3, label: '1. satır tarih kutusu' },
};

test('G22.2 ana sayfa hedefle ölçü karşılaştırması 390x844 (sapma < 2 px)', async ({ page }) => {
  const u = await login(page);
  await addField(page, u, 'Kiraz Bahçesi', 'elma-kiraz-armut', 'Merkez', 'Isparta');
  await page.goto('/');
  await expect(page.getByTestId('kart-seridi-kart')).toHaveCount(5);
  await expect(page.getByTestId('ikon-gorsel-arazilerim')).toBeVisible();
  // Şerit kendiliğinden kayar: kart konumunu kaydırma payıyla düzelt.
  const scroll = await page.getByTestId('kart-seridi').evaluate((el) => el.scrollLeft);
  const lines: string[] = [];
  const bad: string[] = [];
  for (const [id, t] of Object.entries(TARGET)) {
    const b = (await page.getByTestId(id).first().boundingBox())!;
    const x = id.startsWith('kart-gorsel') ? b.x + scroll : b.x;
    const d = {
      x: x - t.x,
      y: b.y - t.y,
      w: b.width - t.w,
      h: id === 'tarih-kutusu' ? 0 : b.height - t.h,
    };
    const worst = Math.max(...Object.values(d).map(Math.abs));
    const f = (v: number) => v.toFixed(1);
    lines.push(
      `| ${t.label} | ${f(t.x)}, ${f(t.y)}, ${f(t.w)} x ${f(t.h)} | ${f(x)}, ${f(b.y)}, ${f(b.width)} x ${f(b.height)} | ${f(worst)} |`,
    );
    if (worst >= 2) bad.push(`${id}: ${JSON.stringify(d)}`);
  }
  await page.screenshot({ path: resolve(DOCS, 'anasayfa_390x844.png') });
  writeFileSync(
    resolve(DOCS, 'anasayfa_olcum.generated.md'),
    [
      '<!-- Otomatik üretilir: apps/e2e/tests/g22.spec.ts. Elle değiştirmeyin. -->',
      '| Öğe | Hedef (x, y, g x y) | Uygulama (x, y, g x y) | En büyük sapma (px) |',
      '| --- | --- | --- | --- |',
      ...lines,
      '',
    ].join('\n'),
  );
  expect(bad).toEqual([]);
});

const PAGES: { name: string; open: (p: Page) => Promise<void>; url: RegExp }[] = [
  ...(
    [
      ['arazilerim', /\/tarlalarim$/],
      ['arazi-islemleri', /\/arazi-islemleri$/],
      ['verim-haritasi', /\/verim-haritasi$/],
      ['hava', /\/hava$/],
      ['uzman', /\/soru-sor$/],
      ['bildirim', /\/bildirimler$/],
      ['ayarlar', /\/ayarlar$/],
    ] as const
  ).map(([key, url]) => ({
    name: key,
    url,
    open: async (p: Page) => {
      await p.getByTestId(`ikon-${key}`).click();
    },
  })),
  // G23: sağ kenar menüsü kaldırıldı; aynı sayfalar Arazi İşlemleri kartlarından açılır.
  ...(
    [
      ['hub-plan', /\/uretim-plani(\?.*)?$/],
      ['hub-takvim', /\/takvim(\?.*)?$/],
      ['hub-tasarruf', /\/tasarruf(\?.*)?$/],
      ['hub-guncelle', /\/arazi-duzenle(\?.*)?$/],
      ['hub-toprak', /\/toprak-turleri(\?.*)?$/],
      ['hub-kc', /\/kc-listesi(\?.*)?$/],
    ] as const
  ).map(([key, url]) => ({
    name: key,
    url,
    open: async (p: Page) => {
      await p.getByTestId('ikon-arazi-islemleri').click();
      await p.getByTestId(key).click();
    },
  })),
];

test('G22.7 hiçbir ikon sayfası yalnız "Yükleniyor"da kalmaz; görüntüler kaydedilir', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const u = await login(page);
  await addField(page, u, 'Burç Fıstık Bahçesi', 'antep-fistigi', 'Şehitkamil');
  mkdirSync(ICONS_OUT, { recursive: true });
  for (const p of PAGES) {
    await page.goto('/');
    await expect(page.getByTestId('bugun-tarla')).toBeVisible();
    await p.open(page);
    await expect(page).toHaveURL(p.url);
    // İskelet en geç 10 sn'de kalkar; hata kartı da çıkmaz (sunucu çalışıyor).
    await expect(page.locator('[data-testid="iskelet"]:visible')).toHaveCount(0, {
      timeout: 11_000,
    });
    await expect(page.locator('[data-testid="yukleme-hatasi"]:visible')).toHaveCount(0);
    const text = (await page.locator('body').innerText()).trim();
    expect(text, `${p.name}: yalnız yükleniyor`).not.toMatch(/^(Yükleniyor|.*alınıyor)$/s);
    // Tutarlı üst bant + geri düğmesi (G22.8).
    await expect(page.locator('[data-testid="ust-bant"]:visible').first()).toBeVisible();
    await expect(page.locator('[data-testid="geri"]:visible').first()).toBeVisible();
    await page.screenshot({ path: resolve(ICONS_OUT, `${p.name}.png`) });
  }
});

test('G22.7 sunucu yanıt vermezse en geç 10 sn sonra "Veri alınamadı" + Tekrar dene', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const u = await login(page);
  // API'ye giden her istek asılı kalır (yanıt hiç gelmez).
  await page.route(`${u.api}/**`, () => undefined);
  for (const path of [
    '/',
    '/hava',
    '/arazi-islemleri',
    '/bildirimler',
    '/uretim-plani',
    '/takvim',
    '/tarlalarim',
  ]) {
    await page.goto(path);
    await expect(page.locator('[data-testid="yukleme-hatasi"]:visible').first()).toBeVisible({
      timeout: 13_000,
    });
    await expect(page.locator('[data-testid="yeniden-dene"]:visible').first()).toBeVisible();
    await expect(page.locator('[data-testid="iskelet"]:visible')).toHaveCount(0);
  }
});
