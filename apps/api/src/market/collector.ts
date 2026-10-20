import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DB } from '../auth/auth.service';
import { systemTx, type Db } from '../db/db';
import { CLOCK } from '../weather/tokens';
import { parseBorsaBulletin, parseIbbHal, parseTepge, type PriceRecord } from './parse';
import { parseRobots, robotsAllows } from './robots';

export const MARKET_FETCH = Symbol('MARKET_FETCH');
export const MARKET_SOURCES = Symbol('MARKET_SOURCES');
export const MARKET_SLEEP = Symbol('MARKET_SLEEP');

export const USER_AGENT = 'TarimPusulaBot/0.1 (+mustafaozbal3@gmail.com)';
/** Aynı kaynağa iki çekim arasında en az bu kadar süre (saat); robots'taki Crawl-Delay ayrıca uygulanır. */
export const MIN_REFETCH_HOURS = 6;

export interface MarketSourceConfig {
  id: string;
  name: string;
  /** Veri adresi. Boşsa kaynak devre dışıdır (uydurma adres kullanılmaz). */
  url: string | null;
  licenseNote: string;
  /** Biçim sürümü: ayrıştırıcı değişirse artar, kayıt künyesine yazılır. */
  formatVersion: string;
  parse: (body: string) => PriceRecord[];
  place: {
    id: string;
    name: string;
    province: string | null;
    lat: number | null;
    lon: number | null;
    approx: boolean;
  };
}

export type RunStatus = 'ok' | 'disabled' | 'blocked' | 'throttled' | 'empty' | 'error';

export interface RunResult {
  sourceId: string;
  status: RunStatus;
  stored: number;
  detail?: string;
}

/** Üretim yapılandırması. Adresler ortamdan gelir; yoksa kaynak kapalıdır. */
export function defaultMarketSources(env: NodeJS.ProcessEnv = process.env): MarketSourceConfig[] {
  return [
    {
      id: 'ibb-hal',
      name: 'İBB Hal Fiyatları',
      url: env['MARKET_IBB_URL'] || null,
      licenseNote:
        'İBB Açık Veri Lisansı (data.ibb.gov.tr/license); atıfla, ürün ve tarih etiketiyle gösterilir.',
      formatVersion: 'ibb-hal-v1',
      parse: parseIbbHal,
      place: {
        id: 'ibb-hal-istanbul',
        name: 'İstanbul Hali',
        province: 'İstanbul',
        lat: 41.0082,
        lon: 28.9784,
        approx: true,
      },
    },
    {
      id: 'tepge-aylik',
      name: 'TEPGE Tarım Ürünleri Piyasaları (aylık)',
      url: env['MARKET_TEPGE_URL'] || null,
      licenseNote:
        'Tarım ve Orman Bakanlığı TEPGE yayını; kaynak ve dönem belirtilerek atıf yapılır.',
      formatVersion: 'tepge-aylik-v1',
      parse: parseTepge,
      place: {
        id: 'tepge-ulusal',
        name: 'Türkiye geneli',
        province: null,
        lat: null,
        lon: null,
        approx: false,
      },
    },
    {
      id: 'borsa-bulten',
      name: env['MARKET_BORSA_NAME'] || 'Ticaret Borsası günlük bülteni',
      url: env['MARKET_BORSA_URL'] || null,
      licenseNote:
        'Borsanın herkese açık günlük bülteni; kaynak ve tarih belirtilerek atıf yapılır.',
      formatVersion: 'borsa-bulten-v1',
      parse: parseBorsaBulletin,
      place: {
        id: 'borsa-yerel',
        name: env['MARKET_BORSA_NAME'] || 'Ticaret Borsası',
        province: env['MARKET_BORSA_PROVINCE'] || null,
        lat: env['MARKET_BORSA_LAT'] ? Number(env['MARKET_BORSA_LAT']) : null,
        lon: env['MARKET_BORSA_LON'] ? Number(env['MARKET_BORSA_LON']) : null,
        approx: true,
      },
    },
  ];
}

type FetchFn = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Fiyat toplayıcı. Sıra: robots.txt (yoksa/404 izinli; ulaşılamıyor ya da 5xx ise ÇEKME) > Crawl-Delay
 * > veri > ayrıştır > kaynak künyesiyle sakla. Yasaklı yol çekilmez; tekrar çekim aralığı sınırlıdır.
 */
@Injectable()
export class MarketCollector {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MARKET_FETCH) private readonly fetchFn: FetchFn,
    @Inject(MARKET_SOURCES) private readonly sources: MarketSourceConfig[],
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(MARKET_SLEEP) private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async runAll(opts: { force?: boolean } = {}): Promise<RunResult[]> {
    const out: RunResult[] = [];
    for (const s of this.sources) out.push(await this.run(s, opts.force ?? false));
    return out;
  }

  private async get(url: string): Promise<{ ok: boolean; status: number; body: string }> {
    const res = await this.fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: AbortSignal.timeout(20_000),
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  }

  async run(cfg: MarketSourceConfig, force = false): Promise<RunResult> {
    await this.upsertSource(cfg);
    if (!cfg.url) return this.finish(cfg, 'disabled', 0, 'adres tanımlı değil');
    const url = new URL(cfg.url);

    if (!force) {
      const [last] = await systemTx(this.db, (q) =>
        q.query<{ at: Date | null }>(
          'SELECT last_fetch_at AS at FROM market_sources WHERE id = $1',
          [cfg.id],
        ),
      );
      if (
        last?.at &&
        this.now().getTime() - new Date(last.at).getTime() < MIN_REFETCH_HOURS * 3600_000
      )
        return { sourceId: cfg.id, status: 'throttled', stored: 0 };
    }

    // robots.txt
    let delaySec: number | null = null;
    try {
      const r = await this.get(`${url.origin}/robots.txt`);
      let allowed = true;
      if (r.status === 404 || r.status === 410) {
        // robots.txt yok: kısıt yok
      } else if (!r.ok) {
        allowed = false; // 5xx/401/403: belirsiz, çekme
      } else {
        const rules = parseRobots(r.body);
        delaySec = rules.crawlDelaySec;
        allowed = robotsAllows(rules, url.pathname + url.search);
      }
      await systemTx(this.db, (q) =>
        q.query(
          `UPDATE market_sources SET robots_checked_at = $2, robots_allowed = $3, crawl_delay_sec = $4 WHERE id = $1`,
          [cfg.id, this.now(), allowed, delaySec],
        ),
      );
      if (!allowed) return this.finish(cfg, 'blocked', 0, 'robots.txt izin vermiyor');
    } catch (e) {
      return this.finish(cfg, 'blocked', 0, `robots.txt okunamadı: ${(e as Error).message}`);
    }
    if (delaySec && delaySec > 0) await this.sleep(delaySec * 1000);

    let body: string;
    try {
      const r = await this.get(cfg.url);
      if (!r.ok) return this.finish(cfg, 'error', 0, `HTTP ${r.status}`);
      body = r.body;
    } catch (e) {
      return this.finish(cfg, 'error', 0, (e as Error).message);
    }

    const records = cfg.parse(body);
    if (records.length === 0) return this.finish(cfg, 'empty', 0, 'ayrıştırılan kayıt yok');
    const fetchedAt = this.now();
    const version = `${cfg.formatVersion}@${fetchedAt.toISOString().slice(0, 10)}`;
    const digest = sha256(body);
    const stored = await systemTx(this.db, async (q) => {
      let n = 0;
      for (const r of records) {
        const rows = await q.query(
          `INSERT INTO market_prices (source_id, place_id, crop_id, product_name, price_min, price_max,
             price_date, fetched_at, source_version, source_url, raw_sha256)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (place_id, product_name, price_date) DO UPDATE SET
             price_min = EXCLUDED.price_min, price_max = EXCLUDED.price_max,
             fetched_at = EXCLUDED.fetched_at, source_version = EXCLUDED.source_version,
             source_url = EXCLUDED.source_url, raw_sha256 = EXCLUDED.raw_sha256
           RETURNING id`,
          [
            cfg.id,
            cfg.place.id,
            r.cropId,
            r.productName,
            r.priceMin,
            r.priceMax,
            r.priceDate,
            fetchedAt,
            version,
            cfg.url,
            digest,
          ],
        );
        n += rows.length;
      }
      return n;
    });
    return this.finish(cfg, 'ok', stored);
  }

  private async finish(
    cfg: MarketSourceConfig,
    status: RunStatus,
    stored: number,
    detail?: string,
  ): Promise<RunResult> {
    await systemTx(this.db, (q) =>
      q.query('UPDATE market_sources SET last_fetch_at = $2, last_status = $3 WHERE id = $1', [
        cfg.id,
        this.now(),
        detail ? `${status}: ${detail}` : status,
      ]),
    );
    return { sourceId: cfg.id, status, stored, ...(detail ? { detail } : {}) };
  }

  private upsertSource(cfg: MarketSourceConfig): Promise<unknown> {
    return systemTx(this.db, async (q) => {
      await q.query(
        `INSERT INTO market_sources (id, name, url, license_note) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, license_note = EXCLUDED.license_note`,
        [cfg.id, cfg.name, cfg.url, cfg.licenseNote],
      );
      const p = cfg.place;
      await q.query(
        `INSERT INTO market_places (id, source_id, name, province, lat, lon, approx) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, province = EXCLUDED.province,
           lat = EXCLUDED.lat, lon = EXCLUDED.lon, approx = EXCLUDED.approx`,
        [p.id, cfg.id, p.name, p.province, p.lat, p.lon, p.approx],
      );
    });
  }
}
