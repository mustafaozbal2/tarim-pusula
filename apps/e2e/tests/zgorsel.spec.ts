import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * G16: yeni tasarımın (docs/TASARIM_REFERANSI.md) ekran görüntüsü testleri, 390x844.
 * Her ana ekran için görüntü docs/gorsel/ içine yazılır, yoğunluk ve erişilebilirlik ölçülür,
 * referans slaytlarla yan yana karşılaştırma sayfası docs/gorsel/KARSILASTIRMA.md üretilir.
 */
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel');
const VIEW_H = 844;
const TAB_BAR = 64;

interface Shot {
  name: string;
  title: string;
  route: string;
  /** Sekme çubuğu olan ekranlarda alt çubuk içerik sayılmaz. */
  tabs: boolean;
  setup: 'alan' | 'sulama' | 'cikis';
  /** Eski uygulamadaki karşılığı (docs/referans). */
  ref?: { file: string; note: string };
  /** Ekran hazır olana kadar beklenecek metin. */
  ready: string;
}

const SLAYT11 = {
  file: 'eski_uygulama_slayt11.jpg',
  note: 'Duyurular / Bildirimler, tarih kutulu yeşil satırlar',
};
const SLAYT12 = { file: 'eski_uygulama_slayt12.jpg', note: 'Kc ve toprak listeleri' };
const SLAYT13 = { file: 'eski_uygulama_slayt13.jpg', note: 'Ana ekran şeması, 6 özellik' };

const SHOTS: Shot[] = [
  {
    name: 'bugun',
    title: 'Bugün (ana ekran)',
    route: '/',
    tabs: true,
    setup: 'alan',
    ref: SLAYT11,
    ready: 'Duyurular',
  },
  {
    name: 'tarlalarim',
    title: 'Tarlalarım (liste)',
    route: '/tarlalarim',
    tabs: true,
    setup: 'alan',
    ref: SLAYT13,
    ready: 'Burç Köyü Fıstık Bahçesi',
  },
  {
    name: 'tarla-ekle',
    title: 'Tarla ekle (4 konum yolu)',
    route: '/tarla-ekle',
    tabs: false,
    setup: 'alan',
    ready: 'Tarlan nerede?',
  },
  {
    name: 'takvim',
    title: 'Takvim',
    route: '/takvim',
    tabs: false,
    setup: 'alan',
    ref: SLAYT13,
    ready: 'Takvim',
  },
  {
    name: 'sulama',
    title: 'Sulama',
    route: '/sulama',
    tabs: false,
    setup: 'sulama',
    ready: 'Kapalı',
  },
  {
    name: 'soru-sor',
    title: 'Soru sor (Pusula AI)',
    route: '/soru-sor',
    tabs: true,
    setup: 'alan',
    ready: 'Ne öğrenmek istiyorsun?',
  },
  { name: 'pazar', title: 'Pazar', route: '/pazar', tabs: true, setup: 'alan', ready: 'Pazar' },
  {
    name: 'bitki-sagligi',
    title: 'Bitki sağlığı (NDVI)',
    route: '/ndvi',
    tabs: false,
    setup: 'alan',
    ref: SLAYT13,
    ready: 'Bitki',
  },
  {
    name: 'veri-cuzdani',
    title: 'Veri cüzdanı',
    route: '/veri-cuzdani',
    tabs: false,
    setup: 'alan',
    ready: 'Veri',
  },
  {
    name: 'giris',
    title: 'Giriş',
    route: '/giris',
    tabs: false,
    setup: 'cikis',
    ready: 'Telefonunla giriş yap',
  },
  {
    name: 'ayarlar',
    title: 'Ayarlar',
    route: '/ayarlar',
    tabs: false,
    setup: 'alan',
    ready: 'Yazı boyutu',
  },
  {
    name: 'kc-listesi',
    title: 'Bitki türü ve Kc listesi',
    route: '/kc-listesi',
    tabs: false,
    setup: 'alan',
    ref: SLAYT12,
    ready: 'Zeytin',
  },
  {
    name: 'toprak-turleri',
    title: 'Toprak türleri',
    route: '/toprak-turleri',
    tabs: false,
    setup: 'alan',
    ref: SLAYT12,
    ready: 'Killi toprak',
  },
];

async function prepare(page: Page, kind: Shot['setup']) {
  if (kind === 'cikis') return;
  if (kind === 'sulama') {
    const u = (await (await page.request.get('/__e2e/irrigation')).json()) as {
      api: string;
      token: string;
    };
    await page.addInitScript(
      ([api, token]) => {
        localStorage.setItem('config.apiUrl', api!);
        localStorage.setItem('session.token', token!);
      },
      [u.api, u.token],
    );
    return;
  }
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: {
      name: 'Burç Köyü Fıstık Bahçesi',
      province: 'Gaziantep',
      district: 'Nizip',
      village: 'Burç',
      lat: 37.0662,
      lon: 37.3833,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  await page.request.get('/__e2e/calendar-seed');
  await page.request.get('/__e2e/announce?n=7');
  await page.request.get('/__e2e/market-collect');
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
}

/** DOM ölçümleri: içerik alt sınırı, dokunma hedefleri, etiketsiz düğmeler. */
async function measure(page: Page, tabs: boolean) {
  return page.evaluate(
    ([tabBar, hasTabs]) => {
      const inTabBar = (el: Element) => !!el.closest('[role="tablist"]') && hasTabs;
      let bottom = 0;
      for (const el of Array.from(document.querySelectorAll('*'))) {
        if (el.children.length > 0 || !(el.textContent ?? '').trim()) continue;
        if (inTabBar(el)) continue;
        bottom = Math.max(bottom, el.getBoundingClientRect().bottom);
      }
      const small: string[] = [];
      const unnamed: string[] = [];
      const vw = window.innerWidth;
      for (const el of Array.from(
        document.querySelectorAll('[role="button"],[role="tab"],[role="link"],input,textarea'),
      )) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.left > vw) continue;
        const label = el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? '';
        if (!label.trim() && !el.getAttribute('placeholder'))
          unnamed.push(el.outerHTML.slice(0, 80));
        if (r.height < 43.5 || r.width < 43.5)
          small.push(`${label.trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return { bottom, small, unnamed, usable: window.innerHeight - (hasTabs ? tabBar : 0) };
    },
    [TAB_BAR, tabs] as const,
  );
}

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

const done: Shot[] = [];
for (const shot of SHOTS) {
  test(`görsel: ${shot.name} dolu, 44 px hedefler, etiketli`, async ({ page }) => {
    await prepare(page, shot.setup);
    await page.goto(shot.route);
    await expect(page.getByText(shot.ready, { exact: false }).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(shot.name === 'tarlalarim' ? 800 : 400);

    await page.screenshot({ path: resolve(OUT, `${shot.name}.png`) });
    const m = await measure(page, shot.tabs);
    // Ana içerik yarım ekran değil: içerik alt sınırı kullanılabilir alanın en az %70'ine ulaşır.
    expect(m.bottom, `${shot.name} içerik alt sınırı`).toBeGreaterThanOrEqual(m.usable * 0.7);
    expect(m.small, `${shot.name} 44 px altı hedefler`).toEqual([]);
    expect(m.unnamed, `${shot.name} etiketsiz düğme`).toEqual([]);
    done.push(shot);
  });
}

test('görsel: Bugün 390x844 ekranda kaydırmadan en az 6 liste satırı', async ({ page }) => {
  await prepare(page, 'alan');
  await page.goto('/');
  await expect(page.getByTestId('liste-satiri').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  const rows = await page
    .getByTestId('liste-satiri')
    .evaluateAll(
      (els, [limit]) =>
        els
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.top >= 0 && r.bottom <= (limit as number)).length,
      [VIEW_H - TAB_BAR],
    );
  expect(rows).toBeGreaterThanOrEqual(6);
  // Bildirimler sekmesinde de en az 5 satır (onaysız veride uyarı satırı yok, yalnız bilgi).
  await page.getByRole('tab', { name: 'Bildirimler' }).click();
  await expect(page.getByTestId('bugun-bildirimler')).toBeVisible();
  expect(
    await page.getByTestId('bugun-bildirimler').getByTestId('liste-satiri').count(),
  ).toBeGreaterThanOrEqual(5);
});

test('görsel: Bugün hızlı erişim şeridinde 6 simge ve konum başlığı', async ({ page }) => {
  await prepare(page, 'alan');
  await page.goto('/');
  const strip = page.getByTestId('bugun-hizli');
  await expect(strip).toBeVisible();
  for (const label of [
    'Arazi',
    'Üretim planı',
    'Takvim',
    'Erken uyarı',
    'Akıllı cihazlar',
    'Uzmana sor',
  ]) {
    await expect(strip.getByRole('button', { name: label })).toBeVisible();
  }
  await expect(page.getByTestId('konum-baslik')).toHaveText('BURÇ');
  await expect(page.getByRole('img', { name: 'Çiftçi çizimi' })).toBeVisible();
});

test('Ayarlar: Büyük yazı boyutu gövdeyi 15 px → 18 px yapar ve kalıcıdır', async ({ page }) => {
  await prepare(page, 'alan');
  await page.goto('/ayarlar');
  const probe = () =>
    page
      .getByText('Sürüm', { exact: true })
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  const before = await probe();
  await page.getByRole('tab', { name: 'Büyük' }).click();
  await expect.poll(probe).toBeGreaterThan(before * 1.15);
  await page.reload();
  await expect.poll(probe).toBeGreaterThan(before * 1.15);
  await page.getByRole('tab', { name: 'Normal' }).click();
  await expect.poll(probe).toBeCloseTo(before, 0);
});

test('Bilgi listeleri: Kc tablosu aranır, taslaklar rozetli; toprak türleri', async ({ page }) => {
  await prepare(page, 'alan');
  await page.goto('/kc-listesi');
  const table = page.getByTestId('kc-tablosu');
  await expect(table.getByText('Zeytin', { exact: true })).toBeVisible();
  await expect(page.getByText('Uzman onayı bekliyor').first()).toBeVisible();
  await page.getByLabel('Bitki ara').fill('zeyt');
  await expect(table.getByText('Zeytin', { exact: true })).toBeVisible();
  await expect(table.getByText('Buğday', { exact: true })).toHaveCount(0);
  await page.goto('/toprak-turleri');
  await expect(page.getByTestId('toprak-tablosu')).toContainText('Tınlı toprak');
  await expect(page.getByTestId('toprak-tablosu')).toContainText('0,25');
});

test('Sunucu adresi yokken uygulama çökmez, "Sunucuya bağlanılamadı" kartı çıkar', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/giris');
  await page.getByTestId('giris-telefon').fill('05320000000');
  await page.getByRole('button', { name: 'Kod gönder' }).click();
  const card = page.getByTestId('sunucu-karti');
  await expect(card).toContainText('Sunucuya bağlanılamadı');
  await expect(card).toContainText('Sunucu adresi ayarlanmamış');
  expect(errors).toEqual([]);
  // Adres uygulama içinden yazılır ve kaydedilir.
  await page.getByTestId('sunucu-adres-girdi').fill('bozuk adres');
  await page.getByRole('button', { name: 'Adresi kaydet' }).click();
  await expect(card).toContainText('http://');
  await page.getByTestId('sunucu-adres-girdi').fill('http://192.168.1.20:8210/');
  await page.getByRole('button', { name: 'Adresi kaydet' }).click();
  await expect(card).toContainText('Adres kaydedildi.');
  await expect(page.getByTestId('sunucu-adres')).toContainText('http://192.168.1.20:8210');
});

test.afterAll(() => {
  const rows = SHOTS.map((s) => {
    const app = `![${s.name}](./${s.name}.png)`;
    const ref = s.ref
      ? `![eski uygulama](../referans/${s.ref.file})<br/>${s.ref.note}`
      : 'Eski uygulamada karşılığı yok; aynı tema (renk, yoğunluk) uygulandı.';
    return `| ${s.title} | ${app} | ${ref} |`;
  });
  const md = `# Görsel karşılaştırma (G16)

Üreten: \`apps/e2e/tests/zgorsel.spec.ts\` (Playwright, 390×844). Sol sütun yeni uygulamanın ekran görüntüsü,
sağ sütun eski uygulamanın referans slaydı (docs/referans). Ölçülen kurallar testte: Bugün'de kaydırmadan ≥ 6 liste satırı,
tüm dokunma hedefleri ≥ 44 px, düğmelerin etiketi var, ana içerik kullanılabilir alanın ≥ %70'ini doldurur.
Renkler ve yoğunluk: docs/TASARIM_REFERANSI.md.

| Ekran | Yeni uygulama | Eski uygulama (referans) |
| --- | --- | --- |
${rows.join('\n')}
`;
  writeFileSync(resolve(OUT, 'KARSILASTIRMA.md'), md);
});
