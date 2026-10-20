import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  assessSuitability,
  economicRange,
  matchSupports,
  parseCsv,
  rankCrops,
  type CropRanking,
  type EconomicRange,
  type ReviewStatus,
  type SuitabilityFactor,
  type SupportRecord,
} from '@tarim/agro-core';
import { shareCreateSchema } from '@tarim/schemas';
import { Me, parse, RequireMfa, Roles } from './auth/access';
import { DataService } from './data.service';
import { systemTx, type Db, type Principal } from './db/db';
import { DEFAULT_DATA_DIR } from './places';
import { trToday } from './controllers.g4';
import { CLOCK } from './weather/tokens';
import { walletSummary } from './wallet';

export const FACTOR_SEED_SOURCE =
  'FAO EcoCrop türü yaklaşık aralıklar; kaynağa karşı doğrulanmadı (data/uygunluk_taslak.csv)';
export const SEED_VERSION = 'taslak-2026-10-19';
export const SEED_DATE = '2026-10-19';
export const SUPPORT_SEED_SOURCE =
  'T.C. Tarım ve Orman Bakanlığı, tarımsal destekler (genel tanıtım; tutar ve şart içermez)';

/**
 * Uygunluk faktörü ve destek tohumunu yükler. Tohum satırları HER ZAMAN taslak gelir; mevcut kaydın
 * onay durumu ve uzman düzeltmeleri bu içe aktarmada ezilmez (yalnız eksik olan eklenir).
 */
export async function importDecisionSeeds(db: Db, dataDir = DEFAULT_DATA_DIR) {
  const [, ...f] = parseCsv(readFileSync(join(dataDir, 'uygunluk_taslak.csv'), 'utf8'));
  const [, ...s] = parseCsv(readFileSync(join(dataDir, 'destekler_taslak.csv'), 'utf8'));
  await systemTx(db, async (q) => {
    for (const [crop, key, label, unit, a, b, c, d, w] of f) {
      if (!crop) continue;
      await q.query(
        `INSERT INTO suitability_factors(crop_id, factor_key, label, unit, a, b, c, d, weight,
           source, source_version, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (crop_id, factor_key) DO NOTHING`,
        [
          crop,
          key,
          label,
          unit ?? '',
          +a!,
          +b!,
          +c!,
          +d!,
          +w!,
          FACTOR_SEED_SOURCE,
          SEED_VERSION,
          SEED_DATE,
        ],
      );
    }
    for (const [id, title, summary, cropIds, provinces, minA, maxA, from, to, url] of s) {
      if (!id) continue;
      await q.query(
        `INSERT INTO supports(id, title, summary, crop_ids, provinces, min_area, max_area, apply_from,
           apply_to, source, source_url, source_version, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
        [
          id,
          title,
          summary,
          cropIds ? cropIds.split('|') : [],
          provinces ? provinces.split('|') : [],
          minA ? +minA : null,
          maxA ? +maxA : null,
          from || null,
          to || null,
          SUPPORT_SEED_SOURCE,
          url || null,
          SEED_VERSION,
          SEED_DATE,
        ],
      );
    }
  });
}

interface FactorRow {
  id: string;
  cropId: string;
  key: string;
  label: string;
  unit: string;
  a: number;
  b: number;
  c: number;
  d: number;
  weight: number;
  reviewStatus: ReviewStatus;
  source: string;
  sourceVersion: string;
  sourceDate: string;
}

const FACTOR_SQL = `SELECT id, crop_id AS "cropId", factor_key AS key, label, unit, a, b, c, d, weight,
  review_status AS "reviewStatus", source, source_version AS "sourceVersion", source_date::text AS "sourceDate"
  FROM suitability_factors`;

const RESERVED = new Set(['fieldId', 'crop', 'yieldLow', 'yieldHigh', 'costLow', 'costHigh']);

function numberParam(name: string, v: string): number {
  const n = Number(v);
  if (v.trim() === '' || !Number.isFinite(n) || Math.abs(n) > 1e7) {
    throw new BadRequestException(`${name} sayı olmalı`);
  }
  return n;
}

/** Ürün uygunluğu: çiftçinin bildiği ölçümlerle (toprak pH, yağış, sıcaklık); bilinmeyen uydurulmaz. */
@Controller('suitability')
export class SuitabilityController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get()
  async rank(@Me() me: Principal, @Query() query: Record<string, string | undefined>) {
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(query)) {
      if (RESERVED.has(k) || v === undefined) continue;
      if (!/^[a-z0-9-]+$/.test(k)) throw new BadRequestException(`bilinmeyen ölçüm: ${k}`);
      values[k] = numberParam(k, v);
    }
    const opt = (k: string) => (query[k] === undefined ? null : numberParam(k, query[k]!));
    const yieldLow = opt('yieldLow');
    const yieldHigh = opt('yieldHigh');
    const costLow = opt('costLow');
    const costHigh = opt('costHigh');

    const { rows, crops, prices } = await this.data.run(me, 'suitability.read', async (q) => ({
      rows: await q.query<FactorRow>(`${FACTOR_SQL} ORDER BY crop_id, factor_key`),
      crops: await q.query<{ id: string; name: string }>(
        'SELECT id, name_tr AS name FROM crops ORDER BY common_rank NULLS LAST, id',
      ),
      prices: query['crop']
        ? await q.query<{ p: number }>(
            `SELECT avg((price_min + price_max) / 2)::float8 AS p FROM market_prices
             WHERE crop_id = $1 AND price_date >= ($2::date - 90) GROUP BY price_date`,
            [query['crop'], trToday(this.now())],
          )
        : [],
    }));

    const byCrop = new Map<string, SuitabilityFactor[]>();
    for (const r of rows) {
      byCrop.set(r.cropId, [
        ...(byCrop.get(r.cropId) ?? []),
        {
          key: r.key,
          label: r.label,
          unit: r.unit,
          trapezoid: [r.a, r.b, r.c, r.d],
          weight: r.weight,
          reviewStatus: r.reviewStatus,
          source: r.source,
          sourceVersion: r.sourceVersion,
          sourceDate: r.sourceDate,
        },
      ]);
    }

    let economic: EconomicRange | null = null;
    let economicNote: string | null = null;
    if (query['crop']) {
      if (yieldLow === null || yieldHigh === null || costLow === null || costHigh === null) {
        economicNote = 'Kazanç aralığı için verim ve maliyet girin; biz uydurmuyoruz.';
      } else {
        economic = economicRange({
          prices: prices.map((p) => p.p),
          yieldKgPerDa: { low: yieldLow, high: yieldHigh },
          costTlPerDa: { low: costLow, high: costHigh },
        });
        if (!economic)
          economicNote = 'Kaynaklı fiyat yetersiz ya da girdiler tutarsız; aralık verilmedi.';
      }
    }

    const items: (CropRanking & {
      cropName: string;
      sources: { source: string; version: string; date: string }[];
    })[] = [];
    for (const c of crops) {
      const factors = byCrop.get(c.id);
      if (!factors) continue;
      const seen = new Map(
        factors.map((f) => [`${f.source}|${f.sourceVersion}|${f.sourceDate}`, f]),
      );
      items.push({
        cropId: c.id,
        cropName: c.name,
        suitability: assessSuitability(factors, values),
        economic: c.id === query['crop'] ? economic : null,
        sources: [...seen.values()].map((f) => ({
          source: f.source,
          version: f.sourceVersion,
          date: f.sourceDate,
        })),
      });
    }
    const ranked = rankCrops(items).map((r) => r.cropId);
    return {
      items,
      ranking: ranked,
      economicNote,
      note: 'Skor yalnız uzman onaylı aralıklarla ve verdiğiniz ölçümlerle hesaplanır.',
    };
  }

  @Post('factors/:id/approve')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async approve(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'suitability.approve', id, async (q) => {
      const rows = await q.query(
        `UPDATE suitability_factors SET review_status = 'uzman-onayli', reviewed_by = $2
         WHERE id = $1 RETURNING id`,
        [id, me.userId],
      );
      return rows.length ? true : undefined;
    });
    return { id, reviewStatus: 'uzman-onayli' };
  }

  @Get('factors')
  @Roles('expert', 'admin')
  factors(@Me() me: Principal) {
    return this.data.run(me, 'suitability.factors', (q) =>
      q.query(`${FACTOR_SQL} ORDER BY crop_id, factor_key`),
    );
  }
}

interface SupportRow {
  id: string;
  title: string;
  summary: string;
  cropIds: string[];
  provinces: string[];
  minAreaDecare: number | null;
  maxAreaDecare: number | null;
  applyFrom: string | null;
  applyTo: string | null;
  reviewStatus: ReviewStatus;
  source: string;
  sourceUrl: string | null;
  sourceVersion: string;
  sourceDate: string;
}

const SUPPORT_SQL = `SELECT id, title, summary, crop_ids AS "cropIds", provinces,
  min_area AS "minAreaDecare", max_area AS "maxAreaDecare", apply_from::text AS "applyFrom",
  apply_to::text AS "applyTo", review_status AS "reviewStatus", source, source_url AS "sourceUrl",
  source_version AS "sourceVersion", source_date::text AS "sourceDate" FROM supports`;

/** Devlet destekleri: kaynaklı; taslak kayıt rozetle listelenir, "başvurabilirsiniz" denmez. */
@Controller('supports')
export class SupportsController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get()
  async list(@Me() me: Principal, @Query('fieldId') fieldId?: string) {
    const field = fieldId
      ? await this.data.runOne(me, 'supports.field', fieldId, async (q) => {
          const [f] = await q.query<{
            province: string | null;
            area: number | null;
            crop: string | null;
          }>('SELECT province, area_decare AS area, crop_id AS crop FROM fields WHERE id = $1', [
            fieldId,
          ]);
          return f;
        })
      : null;
    const rows = await this.data.run(me, 'supports.list', (q) =>
      q.query<SupportRow>(`${SUPPORT_SQL} ORDER BY id`),
    );
    const matches = matchSupports(rows as SupportRecord[], {
      cropId: field?.crop ?? null,
      province: field?.province ?? null,
      areaDecare: field?.area ?? null,
      today: trToday(this.now()),
    });
    return { matches, today: trToday(this.now()) };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async approve(@Me() me: Principal, @Param('id') id: string) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new BadRequestException('geçersiz kimlik');
    await this.data.run(me, 'supports.approve', async (q) => {
      const rows = await q.query(
        `UPDATE supports SET review_status = 'uzman-onayli', reviewed_by = $2 WHERE id = $1 RETURNING id`,
        [id, me.userId],
      );
      if (!rows.length) throw new BadRequestException('destek bulunamadı');
    });
    return { id, reviewStatus: 'uzman-onayli' };
  }
}

interface ShareRow {
  id: string;
  ownerId: string;
  recipientId: string;
  categories: string[];
  purpose: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

const SHARE_SQL = `SELECT id, owner_id AS "ownerId", recipient_id AS "recipientId", categories, purpose,
  created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt" FROM data_shares`;

/** Veri Cüzdanı: verimi gör, indir, kimlerle paylaştığımı yönet. */
@Controller()
export class WalletController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get('me/wallet')
  wallet(@Me() me: Principal) {
    return this.data.run(me, 'wallet.get', async (q) => {
      const shares = await q.query<ShareRow>(`${SHARE_SQL} ORDER BY created_at DESC, id`);
      const now = this.now().getTime();
      const active = (s: ShareRow) => !s.revokedAt && new Date(s.expiresAt).getTime() > now;
      return {
        // Başkasının sizinle paylaşım yapabilmesi için ona verdiğiniz kimlik.
        shareId: me.userId,
        categories: await walletSummary(q, me),
        given: shares
          .filter((s) => s.ownerId === me.userId)
          .map((s) => ({ ...s, active: active(s) })),
        received: shares
          .filter((s) => s.recipientId === me.userId)
          .map((s) => ({ ...s, active: active(s) })),
      };
    });
  }

  @Post('me/shares')
  create(@Me() me: Principal, @Body() body: unknown) {
    const input = parse(shareCreateSchema, body);
    if (input.recipientId === me.userId)
      throw new BadRequestException('Kendinizle paylaşamazsınız');
    return this.data
      .run(me, 'shares.create', async (q) => {
        const expiresAt = new Date(this.now().getTime() + input.days * 86_400_000).toISOString();
        const [row] = await q.query<ShareRow>(
          `INSERT INTO data_shares(owner_id, recipient_id, categories, purpose, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, owner_id AS "ownerId", recipient_id AS "recipientId", categories, purpose,
           created_at AS "createdAt", expires_at AS "expiresAt", revoked_at AS "revokedAt"`,
          [
            me.userId,
            input.recipientId,
            [...new Set(input.categories)],
            input.purpose,
            this.now().toISOString(),
            expiresAt,
          ],
        );
        return row;
      })
      .catch((e: unknown) => {
        // Alıcı kimliği yoksa yabancı anahtar hatası: sızıntı vermeden 400.
        if ((e as { code?: string }).code === '23503')
          throw new BadRequestException('Alıcı bulunamadı');
        throw e;
      });
  }

  @Delete('me/shares/:id')
  @HttpCode(204)
  async revoke(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'shares.revoke', id, async (q) => {
      const rows = await q.query(
        `UPDATE data_shares SET revoked_at = $2 WHERE id = $1 AND owner_id = $3 AND revoked_at IS NULL
         RETURNING id`,
        [id, this.now().toISOString(), me.userId],
      );
      return rows.length ? true : undefined;
    });
  }

  /** Alıcı: kendisiyle paylaşılan (süresi geçmemiş, geri alınmamış) tarlaların özeti. */
  @Get('shared/fields')
  sharedFields(@Me() me: Principal) {
    return this.data.run(me, 'shared.fields', (q) => q.query('SELECT * FROM shared_fields()'));
  }
}
