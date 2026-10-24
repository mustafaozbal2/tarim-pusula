import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * G15: onaylı prototip (docs/prototype) ile gerçek ekranların görsel karşılaştırması.
 * İki ekran 390x844'te görüntülenir; ikisi de 39x84 bloğa indirilip renk farkı ölçülür.
 * Eşik, piksel birebirliği değil DÜZEN benzerliğidir (gerçek veri ve yazı tipi farklı olabilir).
 * Ürettiği görüntüler docs/gorsel/ altına yazılır; sayısal sonuç docs/gorsel/sonuc.json'dadır.
 */
const OUT = resolve(import.meta.dirname, '../../../docs/gorsel');
const PROTO = resolve(import.meta.dirname, '../../../docs/prototype');
const MAX_DIFF = 0.25; // 0 = aynı, 1 = tamamen zıt

interface Pair {
  name: string;
  proto: string;
  route: string;
}
const PAIRS: Pair[] = [
  { name: 'bugun', proto: 'Main.dc.html', route: '/' },
  { name: 'tarlalarim', proto: 'Arazilerim.dc.html', route: '/tarlalarim' },
  { name: 'soru-sor', proto: 'Pusula.dc.html', route: '/soru-sor' },
  { name: 'pazar', proto: 'Pazar.dc.html', route: '/pazar' },
  { name: 'konum', proto: 'Konum.dc.html', route: '/tarla-ekle' },
];

async function login(page: Page) {
  const user = (await (await page.request.get('/__e2e/user')).json()) as {
    api: string;
    token: string;
  };
  const created = await page.request.post(`${user.api}/fields`, {
    headers: { authorization: `Bearer ${user.token}` },
    data: {
      name: 'Burç Köyü Fıstık Bahçesi',
      province: 'Gaziantep',
      lat: 37.0662,
      lon: 37.3833,
      cropId: 'antep-fistigi',
    },
  });
  expect(created.status()).toBe(201);
  await page.addInitScript(
    ([api, token]) => {
      localStorage.setItem('config.apiUrl', api!);
      localStorage.setItem('session.token', token!);
    },
    [user.api, user.token],
  );
}

/** İki PNG'yi tarayıcıda 39x84 bloğa indirip ortalama kanal farkını (0-1) hesaplar. */
async function layoutDiff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const probe = await page.context().newPage();
  try {
    await probe.goto('about:blank');
    return await probe.evaluate(
      async ([x, y]) => {
        const load = (b64: string) =>
          new Promise<ImageData>((res, rej) => {
            const img = new Image();
            img.onload = () => {
              const c = document.createElement('canvas');
              c.width = 39;
              c.height = 84;
              const g = c.getContext('2d')!;
              g.imageSmoothingEnabled = true;
              g.drawImage(img, 0, 0, 39, 84);
              res(g.getImageData(0, 0, 39, 84));
            };
            img.onerror = () => rej(new Error('görüntü okunamadı'));
            img.src = `data:image/png;base64,${b64}`;
          });
        const [p, q] = await Promise.all([load(x!), load(y!)]);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < p.data.length; i += 4) {
          for (let k = 0; k < 3; k++) {
            sum += Math.abs(p.data[i + k]! - q.data[i + k]!);
            n++;
          }
        }
        return sum / n / 255;
      },
      [a.toString('base64'), b.toString('base64')],
    );
  } finally {
    await probe.close();
  }
}

const results: Record<string, number> = {};

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));
test.afterAll(() => {
  writeFileSync(
    resolve(OUT, 'sonuc.json'),
    JSON.stringify({ maxDiff: MAX_DIFF, results }, null, 2),
  );
});

for (const pair of PAIRS) {
  test(`görsel: ${pair.name} prototiple aynı düzen`, async ({ page }) => {
    await login(page);
    if (pair.name === 'pazar') await page.request.get('/__e2e/market-collect');

    await page.goto(pair.route);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const app = await page.screenshot();

    await page.goto(`${pathToFileURL(PROTO).href}/${pair.proto}`);
    await page.waitForTimeout(800);
    const proto = await page.screenshot();

    writeFileSync(resolve(OUT, `${pair.name}.uygulama.png`), app);
    writeFileSync(resolve(OUT, `${pair.name}.prototip.png`), proto);

    const diff = await layoutDiff(page, app, proto);
    results[pair.name] = Number(diff.toFixed(4));
    expect(diff, `${pair.name} düzen farkı`).toBeLessThanOrEqual(MAX_DIFF);
  });
}
