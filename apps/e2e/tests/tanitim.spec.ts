import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * G36: uygulama içi tanıtım. İlk girişte karşılama kartı, ardından sayfa turu; her dokunuşta bir sonraki adım;
 * bitince bir daha kendiliğinden açılmaz; mavi ampul yeniden açar. Otomatik tarayıcıda tur kendiliğinden
 * açılmadığı için (diğer testlerin düğmelerini örtmesin) burada `tanitim.zorla` ile açılır.
 */
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel/tanitim');

async function hazirla(page: Page, tarla = true) {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  if (tarla) {
    const created = await page.request.post(`${user.api}/fields`, {
      headers: { authorization: `Bearer ${user.token}` },
      data: {
        name: 'Fıstık Bahçesi',
        province: 'Gaziantep',
        district: 'Nizip',
        lat: 37.0,
        lon: 37.8,
        cropId: 'antep-fistigi',
      },
    });
    expect(created.status()).toBe(201);
    await page.request.get('/__e2e/announce?n=6&approve=1');
  }
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
      localStorage.setItem('tanitim.zorla', '1');
    },
    [user.api, user.token],
  );
}

test('ilk giriş: karşılama kartı, ana sayfa turu, bitince bir daha açılmaz; mavi ampul yeniden açar', async ({
  page,
}) => {
  mkdirSync(OUT, { recursive: true });
  await hazirla(page);
  await page.goto('/');

  // 1) Karşılama: yeşil kart ekranın büyük kısmını kaplar, dört sayfa, dokundukça ilerler.
  const kart = page.getByTestId('karsilama');
  await expect(kart).toBeVisible();
  await expect(page.getByTestId('karsilama-baslik')).toHaveText('Tarım Pusula nedir?');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(OUT, '01-karsilama.png') });
  const basliklar = ['Nasıl çalışır?', 'Hedefimiz', 'Kullanırsan ne olur?'];
  for (const b of basliklar) {
    await page.getByTestId('karsilama-ilerle').click();
    await expect(page.getByTestId('karsilama-baslik')).toHaveText(b);
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(OUT, '02-karsilama-son.png') });
  await page.getByTestId('karsilama-ilerle').click();
  await expect(kart).toHaveCount(0);

  // 2) Ana sayfa turu kendiliğinden başlar: ilk adım genel açıklama, sonraki adımlar düğmeleri ışıklandırır.
  await expect(page.getByTestId('tanitim-turu')).toBeVisible();
  await expect(page.getByTestId('tanitim-baslik')).toHaveText('Ana sayfan');
  const sayac = await page.getByTestId('tanitim-sayac').innerText();
  const toplam = Number(sayac.split('/')[1]);
  expect(toplam).toBeGreaterThanOrEqual(15);
  const gorulen: string[] = [];
  for (let i = 1; i < toplam; i++) {
    await page.getByTestId('tanitim-ilerle').click({ position: { x: 20, y: 300 } });
    await expect(page.getByTestId('tanitim-sayac')).toHaveText(`${i + 1} / ${toplam}`);
    await expect(page.getByTestId('tanitim-vurgu')).toBeVisible();
    const baslik = await page.getByTestId('tanitim-baslik').innerText();
    gorulen.push(baslik);
    if ([1, 7, 8, 9, 11, toplam - 3].includes(i)) {
      await page.waitForTimeout(700);
      await page.screenshot({
        path: resolve(OUT, `03-ana-${String(i + 1).padStart(2, '0')}.png`),
      });
    }
    // Vurgu ve açıklama kartı ekranın içinde kalır.
    await expect
      .poll(async () => {
        const v = await page.getByTestId('tanitim-vurgu').boundingBox();
        const k = await page.getByTestId('tanitim-kart').boundingBox();
        return !!(
          v &&
          k &&
          v.y + v.height > 0 &&
          v.y < 844 &&
          k.y >= 0 &&
          k.y + k.height <= 844 &&
          k.x >= 0 &&
          k.x + k.width <= 390
        );
      })
      .toBe(true);
  }
  for (const b of ['Arazilerim', 'Menü', 'Mavi ampul', 'Haber şeridi', 'Beş sekme', 'Ne Eksem?'])
    expect(gorulen).toContain(b);
  // Son adımda dokununca tur kapanır.
  await page.getByTestId('tanitim-ilerle').click({ position: { x: 20, y: 300 } });
  await expect(page.getByTestId('tanitim-turu')).toHaveCount(0);

  // 3) Yeniden girişte ne karşılama ne tur açılır.
  await page.reload();
  await expect(page.getByTestId('ana-sekmeli-kart')).toBeVisible();
  await page.waitForTimeout(1800);
  await expect(page.getByTestId('karsilama')).toHaveCount(0);
  await expect(page.getByTestId('tanitim-turu')).toHaveCount(0);

  // 4) Mavi ampul o sayfanın turunu baştan açar; "Geç" kapatır.
  await page.getByTestId('yardim-dugmesi').click();
  await expect(page.getByTestId('tanitim-baslik')).toHaveText('Ana sayfan');
  await page.getByTestId('tanitim-gec').click();
  await expect(page.getByTestId('tanitim-turu')).toHaveCount(0);
});

test('tarlası olmayan çiftçide tur "İlk tarlanı ekle" düğmesini gösterir; olmayan hedeflerin adımı atlanır', async ({
  page,
}) => {
  await hazirla(page, false);
  await page.goto('/');
  await page.getByTestId('karsilama-kapat').click();
  await expect(page.getByTestId('tanitim-turu')).toBeVisible();
  const toplam = Number((await page.getByTestId('tanitim-sayac').innerText()).split('/')[1]);
  const basliklar: string[] = [];
  for (let i = 1; i < toplam; i++) {
    await page.getByTestId('tanitim-ilerle').click({ position: { x: 20, y: 300 } });
    await expect(page.getByTestId('tanitim-sayac')).toHaveText(`${i + 1} / ${toplam}`);
    basliklar.push(await page.getByTestId('tanitim-baslik').innerText());
  }
  expect(basliklar).toContain('İlk tarlanı ekle');
  expect(basliklar).not.toContain('Seçili tarlan');
  expect(basliklar).not.toContain('Liste satırı');
});

/** Karşılama görülmüş çiftçi: girdiği her sayfada o sayfanın turu kendiliğinden açılır. */
const SAYFALAR: { yol: string; ilk: string; enAz: number }[] = [
  { yol: '/hava', ilk: 'Hava Durumu', enAz: 5 },
  { yol: '/ikiz-tarim', ilk: 'İkiz Tarım', enAz: 8 },
  { yol: '/ne-eksem', ilk: 'Ne Eksem?', enAz: 6 },
  { yol: '/yapay-zeka', ilk: 'Nuvia ile sohbet', enAz: 8 },
  { yol: '/tarlalarim', ilk: 'Arazilerim', enAz: 6 },
  { yol: '/arazi-islemleri', ilk: 'Arazi İşlemleri', enAz: 6 },
  { yol: '/ayarlar', ilk: 'Ayarlar', enAz: 8 },
  { yol: '/soru-sor', ilk: 'Uzman Desteği', enAz: 6 },
];

test('her sayfanın turu: ilk girişte açılır, her adımda vurgu ve kart ekranın içinde kalır, bitince kapanır', async ({
  page,
}) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });
  await hazirla(page);
  await page.addInitScript(() => localStorage.setItem('tanitim.karsilama.v1', '1'));
  // Ana sayfa turu görülmüş sayılsın: bu test alt sayfalara bakar.
  await page.addInitScript(() => {
    if (!localStorage.getItem('tanitim.sayfalar.v1'))
      localStorage.setItem('tanitim.sayfalar.v1', JSON.stringify(['/']));
  });
  for (const s of SAYFALAR) {
    await page.goto(s.yol);
    await expect(page.getByTestId('tanitim-turu'), `${s.yol} turu açılmadı`).toBeVisible();
    await expect(page.getByTestId('tanitim-baslik')).toHaveText(s.ilk);
    const toplam = Number((await page.getByTestId('tanitim-sayac').innerText()).split('/')[1]);
    expect(toplam, `${s.yol} adım sayısı`).toBeGreaterThanOrEqual(s.enAz);
    for (let i = 1; i < toplam; i++) {
      await page.getByTestId('tanitim-ilerle').click({ position: { x: 12, y: 420 } });
      await expect(page.getByTestId('tanitim-sayac')).toHaveText(`${i + 1} / ${toplam}`);
      // Kart her zaman ekranın içinde; vurgu varsa o da görünür alanda.
      await expect
        .poll(async () => {
          const k = await page.getByTestId('tanitim-kart').boundingBox();
          if (!k || k.y < 0 || k.y + k.height > 844 || k.x < 0 || k.x + k.width > 390) return false;
          const v = page.getByTestId('tanitim-vurgu');
          if ((await v.count()) === 0) return true;
          const b = await v.boundingBox();
          return !!b && b.y + b.height > 0 && b.y < 844;
        })
        .toBe(true);
      if (i === 2 || i === Math.min(5, toplam - 2)) {
        await page.waitForTimeout(900);
        await page.screenshot({
          path: resolve(
            OUT,
            `04${s.yol.replace(/\//g, '-')}-${String(i + 1).padStart(2, '0')}.png`,
          ),
        });
      }
    }
    await page.getByTestId('tanitim-ilerle').click({ position: { x: 12, y: 420 } });
    await expect(page.getByTestId('tanitim-turu')).toHaveCount(0);
  }
  // İkinci girişte tur açılmaz; mavi ampul yeniden açar.
  await page.goto('/hava');
  await expect(page.getByTestId('hava-ozet')).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.getByTestId('tanitim-turu')).toHaveCount(0);
  await page.getByTestId('yardim-dugmesi').click();
  await expect(page.getByTestId('tanitim-baslik')).toHaveText('Hava Durumu');
});

test('Nuvia sohbeti: boşken zıplayan robot ve hazır sorular; hazır soru gönderilir; cevap bildirilebilir', async ({
  page,
}) => {
  await hazirla(page);
  await page.addInitScript(() => {
    localStorage.setItem('tanitim.karsilama.v1', '1');
    localStorage.setItem('tanitim.sayfalar.v1', JSON.stringify(['/', '/yapay-zeka', '/hava']));
  });
  await page.goto('/yapay-zeka');
  await expect(page.getByTestId('yz-karsilama')).toBeVisible();
  await expect(page.getByTestId('ziplayan-robot')).toBeVisible();
  await expect(page.getByTestId('yz-hazir-soru')).toHaveCount(6);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, '05-nuvia-bos.png') });
  await page.getByTestId('yz-hazir-soru').filter({ hasText: 'hava nasıl' }).click();
  // Soru gönderilince karşılama kalkar; robot cevap verir ve cevabın altında "Cevabı bildir" çıkar.
  await expect(page.getByTestId('yz-karsilama')).toHaveCount(0);
  await expect(page.getByTestId('yz-bildir').first()).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: resolve(OUT, '06-nuvia-cevap.png') });
  await page.getByTestId('yz-bildir').first().click();
  await page.getByTestId('yz-bildir-yanlis').click();
  await expect(page.getByTestId('yz-bildirildi')).toContainText('bildirimin alındı');
});
