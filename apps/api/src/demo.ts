import { Controller, Get, Inject } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Public } from './auth/access';
import { MarketCollector, type MarketSourceConfig } from './market/collector';
import { parseBorsaBulletin } from './market/parse';
import { storeDocument, textToPages } from './library';
import { systemTx, type Db } from './db/db';
import { seedUzmanOrnek } from './uzman-ornek';

/** Demo kodu: SMS ve doğrulayıcı (TOTP) yerine geçer. Yalnız DEMO_MODE=1 iken vardır. */
export const DEMO_CODE = '123456';
export const DEMO_FARMER_PHONE = '+905320000001';
export const DEMO_STAFF_PHONE = '+905320000002';
export const DEMO_INFO = Symbol('DEMO_INFO');

export interface DemoInfo {
  demo: true;
  code: string;
  farmerPhone: string;
  staffPhone: string;
}

/**
 * Demo yapılandırması. YALNIZ `DEMO_MODE=1` iken ve üretim ortamında DEĞİLKEN döner; aksi halde
 * `undefined` (demo ucu hiç açılmaz, sabit kod hiç tanınmaz).
 */
export function demoInfo(env: NodeJS.ProcessEnv = process.env): DemoInfo | undefined {
  if (env['DEMO_MODE'] !== '1' || env['NODE_ENV'] === 'production') return undefined;
  return {
    demo: true,
    code: DEMO_CODE,
    farmerPhone: DEMO_FARMER_PHONE,
    staffPhone: DEMO_STAFF_PHONE,
  };
}

/** Arayüzün demo kodunu göstermesi için; yalnız demo modunda kayıtlıdır (yoksa 404). */
@Controller('demo')
export class DemoController {
  constructor(@Inject(DEMO_INFO) private readonly info: DemoInfo) {}

  @Public()
  @Get('info')
  get(): DemoInfo {
    return this.info;
  }
}

const trDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Pazar: dış ağ yok; borsa bülteni kayıtlı örnekten, tarihi BUGÜN olacak biçimde sunulur. */
export function demoMarket(now = new Date()) {
  const bulletin = readFileSync(
    resolve(import.meta.dirname, 'market/fixtures/borsa_bulteni.html'),
    'utf8',
  ).replace('19.10.2026', trDate(now));
  const sources: MarketSourceConfig[] = [
    {
      id: 'borsa-bulten',
      name: 'Örnek veri - Gaziantep Ticaret Borsası',
      url: 'https://borsa.demo.invalid/bulten.html',
      licenseNote: 'Örnek veri (demo)',
      formatVersion: 'borsa-bulten-v1',
      parse: parseBorsaBulletin,
      place: {
        id: 'borsa-gaziantep',
        name: 'Gaziantep Ticaret Borsası',
        province: 'Gaziantep',
        lat: 37.0662,
        lon: 37.3833,
        approx: true,
      },
    },
  ];
  const fetchFn = (async (url: string) => {
    const isRobots = url.endsWith('/robots.txt');
    return {
      ok: !isRobots,
      status: isRobots ? 404 : 200,
      text: async () => (isRobots ? '' : bulletin),
    };
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, sources };
}

/** Pusula AI hazır cevapları: onaylı ÖRNEK belgeler (doz/karışım içermez; atıf için künyeli). */
const DEMO_DOCS = [
  {
    title: 'Örnek veri - Don gecesi için genel bahçe önerileri',
    text: 'Don bekleniyorsa bahçede sisleme ve rüzgârsız, açık gecelere dikkat edilir. Çiçeklenme döneminde don tehlikelidir; ilçe tarım müdürlüğünün duyurularını takip edin. Koruma yöntemi için ziraat mühendisine danışın.',
  },
  {
    title: 'Örnek veri - Sulama zamanı üzerine genel not',
    text: 'Sulama için en uygun saatler sabah erken ve akşamüzeridir; öğle sıcağında su çabuk buharlaşır. Toprağın nemini elle kontrol edin. Sulama süresi ürüne ve toprağa göre değişir; bunu kendi tarlanız için Bugün ekranındaki su ihtiyacı kartından görün.',
  },
  {
    title: 'Örnek veri - Antep fıstığı bahçesi takvimi hakkında',
    text: 'Antep fıstığında bahçe temizliği ve budama ürün takvimine göre planlanır. Takvimdeki işler taslak olabilir; onaylı olanlar uzman onay rozeti taşır. İlaçlama gerekirse doz ve karışım için ilçe tarım müdürlüğüne ya da bitki koruma uzmanına danışın.',
  },
];

/** Pusula AI için hazır sorular (demo rehberinde de listelenir; testte her biri cevap alır). */
export const DEMO_QUESTIONS = [
  'Sulama için en uygun saatler hangisi?',
  'Don bekleniyorsa bahçede nelere dikkat edilir?',
  'Antep fıstığında bahçe temizliği ve budama ne zaman planlanır?',
] as const;

export const DEMO_CALENDAR: readonly [string, string, string, number, number, number, number][] = [
  ['antep-fistigi', 'Bahçe temizliği', 'Kuru dalları ve yabani otları temizle.', -5, 20, 0, 0],
  ['antep-fistigi', 'Budama', 'Kış budamasını planla.', 10, 25, 0, 0],
  ['zeytin', 'Toprağı havalandır', 'Ağaç diplerini çapala.', -3, 15, 0, 0],
];

/** Demo verisini veri tabanına yazar (kullanıcıdan bağımsız kısım). Her kayıt "Örnek veri" işaretlidir. */
export async function seedDemoData(db: Db, now = new Date()): Promise<void> {
  const day = 86_400_000;
  const md = (offset: number) => {
    const d = new Date(now.getTime() + 3 * 3_600_000 + offset * day);
    return [d.getUTCMonth() + 1, d.getUTCDate()] as const;
  };
  await systemTx(db, async (q) => {
    // Antep fıstığı paketi ve çiçeklenme eşiği "onaylı" gösterilir ki don kartı çalışsın (örnek veri).
    await q.query(
      `UPDATE crop_pack_versions SET review_status = 'uzman-onayli' WHERE crop_id = 'antep-fistigi'`,
    );
    await q.query(
      `INSERT INTO crop_stages(pack_id, seq, name_tr, frost_critical_c, review_status, source)
       SELECT id, 1, 'Çiçeklenme', -2, 'uzman-onayli', 'Örnek veri (demo)' FROM crop_pack_versions
       WHERE crop_id = 'antep-fistigi' ON CONFLICT DO NOTHING`,
    );
    for (const [crop, title, detail, from, to] of DEMO_CALENDAR) {
      const [sm, sd] = md(from);
      const [em, ed] = md(to);
      await q.query(
        `INSERT INTO calendar_templates(crop_id, title, detail, start_month, start_day, end_month, end_day,
           source, source_version, source_date) VALUES ($1,$2,$3,$4,$5,$6,$7,'Örnek veri (demo)','demo','2026-01-01')
         ON CONFLICT DO NOTHING`,
        [crop, title, detail, sm, sd, em, ed],
      );
    }
    await q.query(
      `INSERT INTO announcements(source_org, title, body, published_at, targeting, review_status)
       VALUES ('Örnek veri - Gaziantep İl Tarım ve Orman Müdürlüğü', 'Örnek duyuru: sulama toplantısı',
         'Cuma günü il müdürlüğünde sulama toplantısı yapılacak. (Örnek veri)', $1,
         '{"places":[{"province":"Gaziantep"}],"circle":null,"cropIds":["antep-fistigi"]}'::jsonb,
         'uzman-onayli')`,
      [new Date(now.getTime() - day)],
    );
    // G23: uzman test verileri (Güncel Haberler, Bilgilendirmeler, Yönlendirmeler, Önlemler, Teknoloji).
    await seedUzmanOrnek(q, now);
    for (const d of DEMO_DOCS) {
      const { id } = await storeDocument(
        q,
        null,
        {
          title: d.title,
          publisher: 'Örnek veri (demo)',
          sourceDate: '2026-01-01',
          sourceVersion: 'demo',
          licenseNote: 'Örnek veri',
          tier: 'genel',
        },
        textToPages(d.text),
      );
      await q.query(`UPDATE library_documents SET review_status = 'uzman-onayli' WHERE id = $1`, [
        id,
      ]);
    }
  });
}

/** Demo fiyatlarını (borsa bülteni) toplar. */
export async function seedDemoMarket(collector: MarketCollector): Promise<void> {
  await collector.runAll({ force: true });
}

export interface DemoFieldSpec {
  name: string;
  province: string;
  district: string;
  village: string;
  lat: number;
  lon: number;
  areaDecare: number;
  cropId: string;
}

export const DEMO_FIELDS: DemoFieldSpec[] = [
  {
    name: 'Burç Köyü Antep fıstığı',
    province: 'Gaziantep',
    district: 'Şehitkamil',
    village: 'Burç',
    lat: 37.1,
    lon: 37.4,
    areaDecare: 40,
    cropId: 'antep-fistigi',
  },
  {
    name: 'Yayla zeytinliği',
    province: 'Gaziantep',
    district: 'Nizip',
    village: 'Yayla',
    lat: 37.0,
    lon: 37.8,
    areaDecare: 25,
    cropId: 'zeytin',
  },
];
