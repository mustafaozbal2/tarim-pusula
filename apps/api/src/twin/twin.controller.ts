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
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  accumulatedGdd,
  FAO56_TABLE22_DRAFT,
  GDD_BASE,
  GDD_DEFAULT,
  runScenario,
  runTwinState,
  scorecard,
  twinMode,
  yieldLoss,
  yieldModelFor,
  type ForecastCheck,
  type ReviewStatus,
  type ScenarioResult,
  type TwinDay,
  type TwinEvent,
  type TwinForecastDay,
  type TwinObservation,
  type TwinParams,
  type TwinPlan,
  type TwinState,
  type YieldLoss,
} from '@tarim/agro-core';
import { z } from 'zod';
import { Me, parse } from '../auth/access';
import { pickPack } from '../controllers.g2';
import { SOIL_COLS, WP_COLS, type SoilRow, type WaterParamRow } from '../controllers.g21';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { et0ForDay } from '../weather/today';
import {
  TWIN_FORECAST_DAYS,
  WeatherUnavailableError,
  type TwinWeather,
  type WeatherProvider,
} from '../weather/openmeteo';
import { CLOCK, WEATHER } from '../weather/tokens';

/**
 * İkiz Tarım: tarlanın su ve gelişim ikizi. Hesap agro-core twin.ts; burada veri toplanır,
 * kaynak/tarih/sürüm eklenir ve kural 1 kapısı (öneri / bilgi kipi) uygulanır.
 */

const querySchema = z.object({
  soil: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('tinli'),
  /** Çiftçinin alışkanlığı (isteğe bağlı): her N günde D mm. */
  intervalDays: z.coerce.number().int().min(1).max(60).optional(),
  depthMm: z.coerce.number().min(1).max(300).optional(),
  /** Kaç gün bekleme senaryosu (varsayılan 3). */
  waitDays: z.coerce.number().int().min(1).max(14).default(3),
});

const eventSchema = z.object({
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['sulama', 'yagis']),
  mm: z.number().min(0).max(500),
  note: z.string().max(200).optional(),
});

/** Türkiye tarihi (UTC+3). */
const trDate = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

export interface TwinDto {
  fieldId: string;
  fieldName: string;
  cropId: string | null;
  generatedAt: string;
  today: string;
  mode: 'oneri' | 'bilgi';
  badge: boolean;
  unapproved: string[];
  params: TwinParams & { soilKey: string };
  state: TwinState;
  scenarios: (ScenarioResult & { yieldLoss: YieldLoss })[];
  /** Pusula kuralı senaryosunun ilk sulama günü ve miktarı (öneri kipinde kart metni için). */
  ruleFirstIrrigation: { date: string; mm: number } | null;
  gdd: { sum: number; baseC: number; from: string; source: string; days: number } | null;
  events: (TwinEvent & { id: string; note: string | null })[];
  observations: number;
  scorecard: ReturnType<typeof scorecard>;
  weather: { source: string; version: string; sample: boolean; stale: boolean; fetchedAt: string };
  sources: {
    kc: string | null;
    soil: string | null;
    waterParams: string;
    yield: string;
    method: string;
  };
  assumptions: string[];
}

@Controller('fields')
export class TwinController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get(':id/twin')
  async twin(
    @Me() me: Principal,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ): Promise<TwinDto> {
    const q = parse(querySchema, query);
    const today = trDate(this.now());
    const year = today.slice(0, 4);
    const ctx = await this.data.runOne(me, 'fields.twin', id, async (db) => {
      const [f] = await db.query<{
        id: string;
        name: string;
        lat: number | null;
        lon: number | null;
        cropId: string | null;
      }>('SELECT id, name, lat, lon, crop_id AS "cropId" FROM fields WHERE id = $1', [id]);
      if (!f) return undefined;
      const pack = f.cropId ? await pickPack(db, f.cropId) : undefined;
      const [soil] = await db.query<SoilRow>(`SELECT ${SOIL_COLS} FROM soil_types WHERE key = $1`, [
        q.soil,
      ]);
      const [wp] = f.cropId
        ? await db.query<WaterParamRow>(
            `SELECT ${WP_COLS} FROM crop_water_params WHERE crop_id = $1`,
            [f.cropId],
          )
        : [];
      const events = await db.query<{
        id: string;
        onDate: string;
        kind: 'sulama' | 'yagis';
        mm: number;
        note: string | null;
        source: string;
      }>(
        `SELECT id, on_date::text AS "onDate", kind, mm, note, source FROM twin_events
         WHERE field_id = $1 AND on_date >= ($2::date - interval '70 days') ORDER BY on_date`,
        [id, today],
      );
      const readings = await db.query<{ day: string; theta: number; source: string }>(
        `SELECT (at AT TIME ZONE 'Europe/Istanbul')::date::text AS day, avg(value)::float8 AS theta,
                min(source) AS source
         FROM device_readings WHERE field_id = $1 AND metric = 'soil-moisture'
           AND at >= ($2::date - interval '70 days')
         GROUP BY 1 ORDER BY 1`,
        [id, today],
      );
      const checks = await db.query<{
        issuedOn: string;
        targetDate: string;
        p10: number;
        p50: number;
        p90: number;
        actual: number | null;
        irrigated: boolean | null;
      }>(
        `SELECT issued_on::text AS "issuedOn", target_date::text AS "targetDate", dr_p10 AS p10,
                dr_p50 AS p50, dr_p90 AS p90, actual_dr AS actual, irrigated
         FROM twin_forecasts WHERE field_id = $1 AND verified_at IS NOT NULL
         ORDER BY target_date DESC LIMIT 200`,
        [id],
      );
      return { f, pack, soil, wp, events, readings, checks };
    });
    const { f, pack, soil, wp, events, readings, checks } = ctx;
    if (f.lat === null || f.lon === null) throw new BadRequestException('Tarlanın konumu yok');
    if (!soil) throw new BadRequestException('Toprak türü bulunamadı');
    if (!this.weather.twin)
      throw new ServiceUnavailableException('İkiz hava paketi desteklenmiyor');

    const gddCfg = (f.cropId && GDD_BASE[f.cropId]) || GDD_DEFAULT;
    const seasonFrom = `${year}-${gddCfg.from}`;
    let w: TwinWeather;
    try {
      w = await this.weather.twin(f.lat, f.lon, seasonFrom);
    } catch (e) {
      if (e instanceof WeatherUnavailableError) throw new ServiceUnavailableException(e.message);
      throw e;
    }

    // Parametreler: onaylı yoksa FAO-56 Tablo 22 taslağı ("bilgi" kipi). Kc: paket orta dönem; yoksa 1 (taslak).
    const draft = f.cropId ? FAO56_TABLE22_DRAFT[f.cropId] : undefined;
    const taslak: ReviewStatus = 'taslak-uzman-onayi-bekliyor';
    const wpUsed = wp
      ? { rootDepthM: wp.rootDepthM, pTable: wp.pTable, status: wp.reviewStatus, source: wp.source }
      : draft
        ? {
            rootDepthM: draft.rootDepthM,
            pTable: draft.pTable,
            status: draft.reviewStatus,
            source: draft.source,
          }
        : {
            rootDepthM: 1.0,
            pTable: 0.5,
            status: taslak,
            source: 'Genel varsayım (Zr 1,0 m, p 0,50); ürün parametresi yok',
          };
    const kcUsed = pack
      ? {
          value: Number(pack.kcMid),
          status: pack.reviewStatus,
          source: `${pack.source} (paket v${pack.version})`,
        }
      : { value: 1, status: taslak, source: 'Kc paketi yok; Kc = 1 varsayımı' };
    const params: TwinParams & { soilKey: string } = {
      kc: kcUsed.value,
      thetaFc: soil.thetaFc,
      thetaWp: soil.thetaWp,
      rootDepthM: wpUsed.rootDepthM,
      pTable: wpUsed.pTable,
      soilKey: soil.key,
    };
    const gate = twinMode({
      kc: kcUsed.status,
      soil: soil.reviewStatus,
      waterParams: wpUsed.status,
    });

    const et0Of = (d: TwinWeather['days'][number]) =>
      et0ForDay(d, { lat: f.lat! }, w.elevationM).mmPerDay;
    const pastDays: TwinDay[] = w.days
      .filter((d) => d.date < today)
      .map((d) => ({ date: d.date, et0: et0Of(d), rainMm: d.precipMm ?? 0 }));
    const futureDays = w.days.filter((d) => d.date >= today).slice(0, TWIN_FORECAST_DAYS);
    const memberOf = new Map(w.members.map((m) => [m.date, m]));
    const forecast: TwinForecastDay[] = futureDays.map((d) => {
      const m = memberOf.get(d.date);
      const et0 = et0Of(d);
      return {
        date: d.date,
        et0,
        rainMm: d.precipMm ?? 0,
        members: m ? m.et0.map((e, i) => ({ et0: e, rainMm: m.rainMm[i] ?? 0 })) : [],
      };
    });

    const evs: TwinEvent[] = events.map((e) => ({
      date: e.onDate,
      kind: e.kind,
      mm: e.mm,
      source: e.source,
    }));
    const obs: TwinObservation[] = readings.map((r) => ({
      date: r.day,
      thetaV: r.theta,
      source: r.source,
    }));
    const state = runTwinState(pastDays, params, evs, obs);
    const start = { dr: state.end.dr, sigmaMm: state.end.sigmaMm };

    const plans: TwinPlan[] = [
      { kind: 'kural' },
      { kind: 'bekle', days: q.waitDays },
      { kind: 'kisintili', fraction: 0.7 },
      { kind: 'yok' },
    ];
    if (q.intervalDays !== undefined && q.depthMm !== undefined)
      plans.splice(1, 0, { kind: 'aralik', everyDays: q.intervalDays, depthMm: q.depthMm });
    const ym = yieldModelFor(f.cropId);
    const scenarios = plans.map((p) => {
      const r = runScenario(forecast, params, start, p);
      return { ...r, yieldLoss: yieldLoss(ym, r.etaOverEtx) };
    });
    const kural = scenarios.find((s) => s.plan.kind === 'kural');
    const first = kural?.days.find((d) => d.irrigationMm > 0.5);
    const ruleFirstIrrigation = first ? { date: first.date, mm: first.irrigationMm } : null;

    // Derece-gün: arşiv (sezon başı → pencere başı) + pencere günleri (bugüne kadar).
    const temps = [
      ...w.season.map((s) => ({ tMinC: s.tMinC, tMaxC: s.tMaxC })),
      ...w.days
        .filter((d) => d.date >= seasonFrom && d.date <= today)
        .map((d) => ({ tMinC: d.tMinC, tMaxC: d.tMaxC })),
    ].filter((t) => t.tMaxC >= t.tMinC);
    const gdd = temps.length
      ? {
          sum: accumulatedGdd(temps, gddCfg.baseC),
          baseC: gddCfg.baseC,
          from: seasonFrom,
          source: gddCfg.source,
          days: temps.length,
        }
      : null;

    // Tahmin karnesi için bugünkü "sulama yok" tahminini kaydet (hedef günler gelince doğrulanır).
    const yok = scenarios.find((s) => s.plan.kind === 'yok');
    if (yok && !w.sample) {
      await this.data.run(me, 'fields.twin.record', async (db) => {
        for (const d of yok.days) {
          if (d.date <= today) continue;
          const horizon = Math.round((Date.parse(d.date) - Date.parse(today)) / 86_400_000);
          const i = forecast.findIndex((x) => x.date === d.date);
          const etc = forecast.slice(0, i + 1).reduce((a, x) => a + x.et0 * params.kc, 0);
          const rain = forecast.slice(0, i + 1).reduce((a, x) => a + x.rainMm, 0);
          await db.query(
            `INSERT INTO twin_forecasts(field_id, issued_on, target_date, horizon_days, dr_p10, dr_p50, dr_p90, etc_mm, rain_mm)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (field_id, issued_on, target_date) DO NOTHING`,
            [f.id, today, d.date, horizon, d.dr.p10, d.dr.p50, d.dr.p90, etc, rain],
          );
        }
        // Hedef günü geçmiş tahminleri bugünkü analizle doğrula.
        const byDate = new Map(state.days.map((d) => [d.date, d]));
        const pending = await db.query<{ id: string; targetDate: string; issuedOn: string }>(
          `SELECT id, target_date::text AS "targetDate", issued_on::text AS "issuedOn" FROM twin_forecasts
           WHERE field_id = $1 AND verified_at IS NULL AND target_date < $2 LIMIT 200`,
          [f.id, today],
        );
        for (const p of pending) {
          const actual = byDate.get(p.targetDate);
          if (!actual) continue;
          const irrigated = evs.some(
            (e) => e.kind === 'sulama' && e.date > p.issuedOn && e.date <= p.targetDate,
          );
          const span = state.days.filter((d) => d.date > p.issuedOn && d.date <= p.targetDate);
          await db.query(
            `UPDATE twin_forecasts SET verified_at = now(), actual_dr = $2, actual_etc_mm = $3, actual_rain_mm = $4, irrigated = $5 WHERE id = $1`,
            [
              p.id,
              actual.drEnd,
              span.reduce((a, d) => a + d.etc, 0),
              span.reduce((a, d) => a + d.rainMm, 0),
              irrigated,
            ],
          );
        }
      });
    }
    const fc: ForecastCheck[] = checks
      .filter((c) => c.actual !== null && !c.irrigated)
      .map((c) => ({
        issuedOn: c.issuedOn,
        targetDate: c.targetDate,
        predicted: { p10: c.p10, p50: c.p50, p90: c.p90 },
        actual: c.actual!,
      }));

    return {
      fieldId: f.id,
      fieldName: f.name,
      cropId: f.cropId,
      generatedAt: this.now().toISOString(),
      today,
      mode: gate.mode,
      badge: gate.badge,
      unapproved: gate.unapproved,
      params,
      state,
      scenarios,
      ruleFirstIrrigation,
      gdd,
      events: events.map((e) => ({
        id: e.id,
        date: e.onDate,
        kind: e.kind,
        mm: e.mm,
        source: e.source,
        note: e.note,
      })),
      observations: obs.length,
      scorecard: scorecard(fc),
      weather: {
        source: w.source,
        version: w.version,
        sample: w.sample,
        stale: w.stale,
        fetchedAt: w.fetchedAt,
      },
      sources: {
        kc: kcUsed.source,
        soil: `${soil.source} (${soil.sourceVersion}, ${soil.sourceDate})`,
        waterParams: wpUsed.source,
        yield: ym.source,
        method:
          'FAO-56 kök bölgesi su dengesi (Allen vd. 1998); tek boyutlu Kalman düzeltmesi; topluluk tahmini (Open-Meteo ensemble); FAO-33/66 verim-su ilişkisi. packages/agro-core twin.ts',
      },
      assumptions: [
        ...state.assumptions,
        'Dönem boyunca tek Kc (orta dönem değeri) kullanıldı.',
        w.sample
          ? 'Hava verisi örnek veridir; gerçek tahmin değildir.'
          : 'Tahmin günleri belirsizlik aralığıyla (p10-p90) verilir.',
        ...(gate.mode === 'bilgi'
          ? [
              `Onaysız girdi: ${gate.unapproved.join(', ')}. Sonuçlar bilgi amaçlıdır, öneri değildir.`,
            ]
          : []),
      ],
    };
  }

  @Post(':id/twin/events')
  @HttpCode(201)
  async addEvent(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const e = parse(eventSchema, body);
    const [row] = await this.data.runOne(me, 'fields.twin.event', id, async (db) => {
      const [f] = await db.query<{ id: string }>('SELECT id FROM fields WHERE id = $1', [id]);
      if (!f) return undefined;
      return db.query<{ id: string }>(
        `INSERT INTO twin_events(field_id, user_id, on_date, kind, mm, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [id, me.userId, e.onDate, e.kind, e.mm, e.note ?? null],
      );
    });
    return { id: row!.id };
  }

  @Delete(':id/twin/events/:eventId')
  @HttpCode(204)
  async removeEvent(
    @Me() me: Principal,
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    await this.data.runOne(me, 'fields.twin.event.delete', id, async (db) => {
      const [f] = await db.query<{ id: string }>('SELECT id FROM fields WHERE id = $1', [id]);
      if (!f) return undefined;
      await db.query('DELETE FROM twin_events WHERE id = $1 AND field_id = $2', [eventId, id]);
      return true;
    });
  }
}
