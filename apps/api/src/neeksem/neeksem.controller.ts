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
} from '@nestjs/common';
import {
  gapBandLabel,
  neEksemMode,
  RANK_WEIGHTS,
  rankCandidates,
  remainingQuota,
  type Confidence,
  type CropCandidate,
  type RankedCrop,
  type ReviewStatus,
} from '@tarim/agro-core';
import { z } from 'zod';
import { Me, parse } from '../auth/access';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { CLOCK } from '../weather/tokens';
import { NeEksemData } from './data';

export const NE_EKSEM_DATA = Symbol('NE_EKSEM_DATA');

/**
 * "Ne Eksem?": ulusal arz-talep dengesine göre, çiftçinin tarlasının bulunduğu ilçe için
 * "açığı en yüksek görünen" ürünlerin sıralaması. Hesap agro-core neEksem.ts; burada veri toplanır,
 * kaynak/tarih eklenir ve dil bilgi dilidir (kural 1: onaysız girdiyle öneri değil bilgi).
 *
 * 1. evre (temel güven): TÜİK yeterlilik + resmî havza ürün deseni + bahçe kısıtı + kaynaklı hal
 * fiyatı eğilimi + niyet beyanları. Uydu alan tahmini (Olofsson) çekirdekte hazır; ülke çapı
 * sınıflandırma etiketi (ÇKS) gelince "uydu destekli" güvene geçer.
 */

const intentSchema = z.object({
  cropId: z.string().regex(/^[a-z0-9-]+$/),
  dekar: z.number().positive().max(100_000),
});

const trDate = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
/** Sezon: ağustostan sonra bir sonraki yıl (güzlük ekim planı). */
export const seasonOf = (today: string) =>
  String(Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 8 ? 1 : 0));

export type NeEksemRanked = RankedCrop & {
  bandLabel: string | null;
  intents: { decare: number; count: number };
  remainingQuota: number | null;
  mine: number | null;
};

export interface NeEksemDto {
  fieldId: string;
  fieldName: string;
  province: string | null;
  district: string | null;
  areaDecare: number | null;
  currentCropId: string | null;
  season: string;
  generatedAt: string;
  mode: 'oneri' | 'bilgi';
  badge: boolean;
  confidence: Confidence;
  confidenceLabel: string;
  /** İlçe deseni var mı; il satır sayısı. */
  plan: { district: boolean; provinceRows: number; source: string | null; date: string | null };
  /** Sıralama (en çok 10); ekran ilk 3'ü büyük gösterir. */
  ranked: NeEksemRanked[];
  restricted: (RankedCrop & { bandLabel: string | null })[];
  noData: { cropId: string; name: string }[];
  myIntents: { id: string; cropId: string; name: string; dekar: number }[];
  weights: typeof RANK_WEIGHTS;
  sources: { balance: string[]; plan: string | null; restriction: string | null; prices: string };
  assumptions: string[];
}

interface CropRow {
  id: string;
  name: string;
  lifespan: 'yillik' | 'cok-yillik';
}

@Controller('fields')
export class NeEksemController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(NE_EKSEM_DATA) private readonly ne: NeEksemData,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get(':id/ne-eksem')
  async get(@Me() me: Principal, @Param('id') id: string): Promise<NeEksemDto> {
    const today = trDate(this.now());
    const season = seasonOf(today);
    const ctx = await this.data.runOne(me, 'fields.ne-eksem', id, async (db) => {
      const [f] = await db.query<{
        id: string;
        name: string;
        province: string | null;
        district: string | null;
        areaDecare: number | null;
        cropId: string | null;
      }>(
        'SELECT id, name, province, district, area_decare AS "areaDecare", crop_id AS "cropId" FROM fields WHERE id = $1',
        [id],
      );
      if (!f) return undefined;
      const crops = await db.query<CropRow>(
        'SELECT id, name_tr AS name, lifespan FROM crops ORDER BY common_rank NULLS LAST, id',
      );
      const mine = await db.query<{ id: string; cropId: string; dekar: number }>(
        'SELECT id, crop_id AS "cropId", dekar FROM ekim_niyetleri WHERE field_id = $1 AND season = $2 ORDER BY created_at',
        [id, season],
      );
      // Fiyat eğilimi: son 90 gün ortalaması / bir yıl önceki aynı 90 gün ortalaması − 1.
      const trend = await db.query<{ cropId: string; recent: number | null; past: number | null }>(
        `SELECT crop_id AS "cropId",
                avg((price_min + price_max) / 2) FILTER (WHERE price_date >= $1::date - 90)::float8 AS recent,
                avg((price_min + price_max) / 2) FILTER (WHERE price_date BETWEEN $1::date - 455 AND $1::date - 365)::float8 AS past
         FROM market_prices WHERE crop_id IS NOT NULL GROUP BY crop_id`,
        [today],
      );
      return { f, crops, mine, trend };
    });
    const { f, crops, mine, trend } = ctx;
    // Bölge niyet toplamı: kişisiz (yalnız dekar toplamı ve beyan sayısı) → sistem bağlamı.
    const tally = f.province
      ? await this.data.system((q) =>
          q.query<{ cropId: string; decare: number; count: number }>(
            `SELECT crop_id AS "cropId", sum(dekar)::float8 AS decare, count(*)::int AS count
             FROM ekim_niyetleri WHERE season = $1 AND province = $2 GROUP BY crop_id`,
            [season, f.province],
          ),
        )
      : [];
    const tallyOf = new Map(tally.map((t) => [t.cropId, t]));
    const trendOf = new Map<string, number>();
    for (const t of trend)
      if (t.recent !== null && t.past !== null && t.past > 0)
        trendOf.set(t.cropId, t.recent / t.past - 1);
    const plan = this.ne.planFor(f.province, f.district);
    const districtCrops = new Set(plan.district?.crops ?? []);

    const cands: CropCandidate[] = crops.map((c) => {
      const b = this.ne.balance.get(c.id) ?? null;
      const k = this.ne.restrictions.get(c.id) ?? null;
      return {
        cropId: c.id,
        name: c.name,
        lifespan: c.lifespan,
        yeterlilikPct: b ? b.yeterlilikPct : null,
        balanceSource: b ? { period: b.period, source: b.source, date: b.date } : null,
        inDistrictPlan: districtCrops.has(c.id),
        inProvincePlan: plan.provinceCrops.has(c.id),
        restricted: k ? { rule: k.rule, source: k.source, reviewStatus: k.reviewStatus } : null,
        suitability: null,
        priceTrend: trendOf.get(c.id) ?? null,
      };
    });
    const r = rankCandidates(cands);
    const nameOf = new Map(crops.map((c) => [c.id, c.name]));
    const statuses: ReviewStatus[] = [
      ...r.restricted.map((x) => x.restricted!.reviewStatus),
      'taslak-uzman-onayi-bekliyor', // havza ürün deseni OCR ile çıkarıldı; uzman kontrolü bekliyor
    ];
    const mode = neEksemMode(statuses);
    const mineOf = new Map(mine.map((m) => [m.cropId, m.dekar]));
    const decorate = (x: RankedCrop): NeEksemRanked => ({
      ...x,
      bandLabel: x.band ? gapBandLabel(x.band) : null,
      intents: {
        decare: tallyOf.get(x.cropId)?.decare ?? 0,
        count: tallyOf.get(x.cropId)?.count ?? 0,
      },
      // Talep tonajı (TÜİK denge tablosu tam sütunları) elimizde olmadığından kota hesaplanmaz.
      remainingQuota: remainingQuota(null, tallyOf.get(x.cropId)),
      mine: mineOf.get(x.cropId) ?? null,
    });
    const balanceSources = [
      ...new Set(
        [...this.ne.balance.values()]
          .filter((b) => nameOf.has(b.cropId))
          .map((b) => `${b.source} (${b.period}, ${b.date})`),
      ),
    ];
    const planSrc = plan.district ?? this.ne.plan[0] ?? null;
    const restrictionSrc = [...this.ne.restrictions.values()][0] ?? null;
    return {
      fieldId: f.id,
      fieldName: f.name,
      province: f.province,
      district: f.district,
      areaDecare: f.areaDecare,
      currentCropId: f.cropId,
      season,
      generatedAt: this.now().toISOString(),
      mode,
      badge: mode === 'bilgi',
      confidence: 'temel',
      confidenceLabel:
        'Temel: resmî istatistik ve resmî plan; uydu alan tahmini bu evrede bağlı değil',
      plan: {
        district: !!plan.district,
        provinceRows: plan.provinceRows,
        source: planSrc ? planSrc.source : null,
        date: planSrc ? planSrc.date : null,
      },
      ranked: r.ranked.slice(0, 10).map(decorate),
      restricted: r.restricted.map((x) => ({
        ...x,
        bandLabel: x.band ? gapBandLabel(x.band) : null,
      })),
      noData: r.noData.map((x) => ({ cropId: x.cropId, name: x.name })),
      myIntents: mine.map((m) => ({
        id: m.id,
        cropId: m.cropId,
        name: nameOf.get(m.cropId) ?? m.cropId,
        dekar: m.dekar,
      })),
      weights: RANK_WEIGHTS,
      sources: {
        balance: balanceSources,
        plan: planSrc ? `${planSrc.source} (${planSrc.date})` : null,
        restriction: restrictionSrc
          ? `${restrictionSrc.source} (${restrictionSrc.date}; ${restrictionSrc.reviewStatus})`
          : null,
        prices:
          'Uygulamanın topladığı hal fiyatları (market_prices); son 90 gün / bir yıl önceki aynı dönem',
      },
      assumptions: [
        'Açık oranı = 1 − yeterlilik/100 (TÜİK: yeterlilik = yurt içi üretim / yurt içi kullanım).',
        'Sıralama ağırlıkları bizim seçimimizdir; ürün fiyatı tahmini değildir.',
        f.district && !plan.district
          ? `İlçe (${f.district}) için resmî ürün deseni satırı eşleşmedi; il geneli kullanıldı.`
          : 'Resmî ürün deseni OCR ile çıkarıldı; uzman kontrolü bekliyor.',
        'Tarla uygunluğu bu evrede sıralamaya katılmadı (onaylı faktör ve ölçüm yok).',
        'Kota: talep tonajı elimizde olmadığından yalnız bölge beyan toplamı gösterilir.',
        ...(mode === 'bilgi'
          ? ['Sonuçlar bilgi amaçlıdır, ekim önerisi değildir; karar sizindir.']
          : []),
      ],
    };
  }

  @Post(':id/ne-eksem/niyet')
  @HttpCode(201)
  async declare(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(intentSchema, body);
    const season = seasonOf(trDate(this.now()));
    const row = await this.data.runOne(me, 'fields.ne-eksem.niyet', id, async (db) => {
      const [f] = await db.query<{
        id: string;
        province: string | null;
        district: string | null;
        areaDecare: number | null;
      }>('SELECT id, province, district, area_decare AS "areaDecare" FROM fields WHERE id = $1', [
        id,
      ]);
      if (!f) return undefined;
      if (f.areaDecare !== null && b.dekar > f.areaDecare * 1.05)
        throw new BadRequestException('Beyan, tarla alanından büyük olamaz');
      const [c] = await db.query<{ id: string }>('SELECT id FROM crops WHERE id = $1', [b.cropId]);
      if (!c) throw new BadRequestException('Ürün bulunamadı');
      const [r] = await db.query<{ id: string }>(
        `INSERT INTO ekim_niyetleri(field_id, user_id, crop_id, dekar, season, province, district)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (field_id, crop_id, season) DO UPDATE SET dekar = EXCLUDED.dekar RETURNING id`,
        [id, me.userId, b.cropId, b.dekar, season, f.province, f.district],
      );
      return r;
    });
    return { id: row.id, season };
  }

  @Delete(':id/ne-eksem/niyet/:niyetId')
  @HttpCode(204)
  async remove(@Me() me: Principal, @Param('id') id: string, @Param('niyetId') niyetId: string) {
    await this.data.runOne(me, 'fields.ne-eksem.niyet.sil', id, async (db) => {
      const [f] = await db.query<{ id: string }>('SELECT id FROM fields WHERE id = $1', [id]);
      if (!f) return undefined;
      await db.query('DELETE FROM ekim_niyetleri WHERE id = $1 AND field_id = $2', [niyetId, id]);
      return true;
    });
  }
}
