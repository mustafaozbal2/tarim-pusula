import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  adjustDepletionFraction,
  ASSUMED_TRADITIONAL,
  computeSavings,
  cropEvapotranspiration,
  decideIrrigation,
  estimateDrEnd,
  evaluateDailyReminder,
  evaluateMoistureReminder,
  sanitizeReminderPrefs,
  totalAvailableWater,
  type ReviewStatus,
  type SavingsResult,
  type SeasonDay,
} from '@tarim/agro-core';
import { parseReadingsCsv } from '@tarim/devices';
import { z } from 'zod';
import { Me, parse, RequireMfa, Roles } from './auth/access';
import { pickPack } from './controllers.g2';
import { DataService } from './data.service';
import type { Principal } from './db/db';
import { CLOCK, WEATHER } from './weather/tokens';
import { WeatherUnavailableError, type WeatherProvider } from './weather/openmeteo';
import { et0ForDay } from './weather/today';

const READING_KINDS = ['nem-sensoru', 'hava-istasyonu', 'diger'];
const UNIT_OF = {
  'soil-moisture': 'm3/m3',
  'soil-temp': 'C',
  'air-temp': 'C',
  rain: 'mm',
  'flow-m3': 'm3',
} as const;

const readingSchema = z.object({
  at: z.iso.datetime(),
  metric: z.enum(['soil-moisture', 'soil-temp', 'air-temp', 'rain', 'flow-m3']),
  value: z.number().finite(),
});
const readingsBodySchema = z
  .object({
    csv: z.string().max(200_000).optional(),
    readings: z.array(readingSchema).max(2000).optional(),
  })
  .refine((b) => b.csv !== undefined || b.readings !== undefined, {
    message: 'csv ya da readings gerekir',
  });

/** Ölçüm aralığı denetimi: nem 0..1, sıcaklık -60..70, yağış ve sayaç >= 0. */
function plausible(metric: keyof typeof UNIT_OF, v: number): boolean {
  if (metric === 'soil-moisture') return v >= 0 && v <= 1;
  if (metric === 'soil-temp' || metric === 'air-temp') return v >= -60 && v <= 70;
  return v >= 0;
}

/** Cihaz ölçümleri: ekleme (CSV/elle) ve okuma. Yetki RLS'te: tarlaya yazma/okuma izni. */
@Controller()
export class DeviceReadingsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Post('devices/:id/readings')
  @HttpCode(201)
  async add(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const b = parse(readingsBodySchema, body);
    const errors: { line: number; message: string }[] = [];
    let rows = (b.readings ?? []).map((r) => ({ ...r, unit: UNIT_OF[r.metric] }));
    if (b.csv !== undefined) {
      const parsed = parseReadingsCsv(b.csv);
      errors.push(...parsed.errors);
      rows = rows.concat(
        parsed.readings.map((r) => ({ at: r.at, metric: r.metric, value: r.value, unit: r.unit })),
      );
    }
    const good = rows.filter((r) => plausible(r.metric, r.value));
    const bad = rows.length - good.length;
    if (good.length === 0) {
      throw new BadRequestException(
        errors[0] ? `Satır ${errors[0].line}: ${errors[0].message}` : 'Geçerli ölçüm yok',
      );
    }
    const inserted = await this.data.runOne(me, 'devices.readings.add', id, async (q) => {
      const [dev] = await q.query<{ id: string; fieldId: string; kind: string; source: string }>(
        `SELECT id, field_id AS "fieldId", kind, source FROM devices
         WHERE id = $1 AND can_access_field(field_id, 'write')`,
        [id],
      );
      if (!dev) return undefined;
      if (!READING_KINDS.includes(dev.kind)) {
        throw new BadRequestException('Bu cihaz türü ölçüm kabul etmez');
      }
      let n = 0;
      for (const r of good) {
        const res = await q.query(
          `INSERT INTO device_readings(device_id, field_id, recorded_by, at, metric, value, unit, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (device_id, at, metric) DO NOTHING RETURNING id`,
          [id, dev.fieldId, me.userId, r.at, r.metric, r.value, r.unit, dev.source],
        );
        n += res.length;
      }
      return { n };
    });
    return {
      inserted: inserted.n,
      duplicates: good.length - inserted.n,
      rejected: bad + errors.length,
      errors: errors.slice(0, 10),
    };
  }

  @Get('devices/:id/readings')
  async list(
    @Me() me: Principal,
    @Param('id') id: string,
    @Query('metric') metric?: string,
    @Query('hours') hoursQ?: string,
  ) {
    const hours = hoursQ === undefined ? 72 : Number(hoursQ);
    if (!Number.isFinite(hours) || hours < 1 || hours > 24 * 90) {
      throw new BadRequestException('hours 1 ile 2160 arasında olmalı');
    }
    const m = metric ?? 'soil-moisture';
    if (!(m in UNIT_OF)) throw new BadRequestException('Bilinmeyen metrik');
    return this.data.runOne(me, 'devices.readings.list', id, async (q) => {
      const [dev] = await q.query<{ id: string; name: string; source: string }>(
        'SELECT id, name, source FROM devices WHERE id = $1',
        [id],
      );
      if (!dev) return undefined;
      const readings = await q.query(
        `SELECT at, value, unit FROM device_readings
         WHERE device_id = $1 AND metric = $2 AND at >= now() - ($3 || ' hours')::interval
         ORDER BY at LIMIT 3000`,
        [id, m, String(Math.floor(hours))],
      );
      return { deviceId: id, deviceName: dev.name, metric: m, source: dev.source, readings };
    });
  }
}

interface SoilRow {
  key: string;
  nameTr: string;
  thetaFc: number;
  thetaWp: number;
  reviewStatus: ReviewStatus;
  source: string;
  sourceVersion: string;
  sourceDate: string;
}
export const SOIL_COLS = `key, name_tr AS "nameTr", theta_fc::float8 AS "thetaFc", theta_wp::float8 AS "thetaWp",
  review_status AS "reviewStatus", source, source_version AS "sourceVersion", source_date::text AS "sourceDate"`;

interface WaterParamRow {
  cropId: string;
  rootDepthM: number;
  pTable: number;
  reviewStatus: ReviewStatus;
  source: string;
  sourceVersion: string;
  sourceDate: string;
}
const WP_COLS = `crop_id AS "cropId", root_depth_m::float8 AS "rootDepthM", p_table::float8 AS "pTable",
  review_status AS "reviewStatus", source, source_version AS "sourceVersion", source_date::text AS "sourceDate"`;

const waterParamsSchema = z.object({
  rootDepthM: z.number().positive().max(5),
  pTable: z.number().gt(0).lt(1),
  source: z.string().trim().min(3).max(300),
  sourceVersion: z.string().trim().min(1).max(60),
  sourceDate: z.iso.date(),
});

/** Bitki su parametreleri (kök derinliği, p) ve toprak onayı: yalnız uzman/yönetici + ikinci adım. */
@Controller()
export class WaterParamsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Get('crop-water-params')
  list(@Me() me: Principal) {
    return this.data.run(me, 'cropWaterParams.list', async (q) => {
      const rows = await q.query<WaterParamRow>(
        `SELECT ${WP_COLS} FROM crop_water_params ORDER BY crop_id`,
      );
      return rows.map((r) => ({ ...r, needsBadge: r.reviewStatus !== 'uzman-onayli' }));
    });
  }

  /** Değer kaynakla girilir; HER ZAMAN taslak başlar. Onay ayrı adımdır. */
  @Put('crops/:id/water-params')
  @RequireMfa()
  @Roles('expert', 'admin')
  async put(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new BadRequestException('geçersiz kimlik');
    const w = parse(waterParamsSchema, body);
    await this.data.run(me, 'cropWaterParams.put', async (q) => {
      await q
        .query('DELETE FROM crop_water_params WHERE crop_id = $1', [id])
        .catch(() => undefined);
      await q.query(
        `INSERT INTO crop_water_params(crop_id, root_depth_m, p_table, source, source_version, source_date)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, w.rootDepthM, w.pTable, w.source, w.sourceVersion, w.sourceDate],
      );
    });
    return { cropId: id, reviewStatus: 'taslak-uzman-onayi-bekliyor' };
  }

  @Post('crops/:id/water-params/approve')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async approve(@Me() me: Principal, @Param('id') id: string) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new BadRequestException('geçersiz kimlik');
    await this.data.run(me, 'cropWaterParams.approve', async (q) => {
      const rows = await q.query(
        `UPDATE crop_water_params SET review_status = 'uzman-onayli', reviewed_by = $2
         WHERE crop_id = $1 RETURNING crop_id`,
        [id, me.userId],
      );
      if (!rows.length) throw new BadRequestException('Parametre bulunamadı');
    });
    return { cropId: id, reviewStatus: 'uzman-onayli' };
  }

  @Post('soils/:key/approve')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async approveSoil(@Me() me: Principal, @Param('key') key: string) {
    if (!/^[a-z0-9-]+$/.test(key)) throw new BadRequestException('geçersiz kimlik');
    await this.data.run(me, 'soils.approve', async (q) => {
      const rows = await q.query(
        `UPDATE soil_types SET review_status = 'uzman-onayli', reviewed_by = $2 WHERE key = $1 RETURNING key`,
        [key, me.userId],
      );
      if (!rows.length) throw new BadRequestException('Toprak türü bulunamadı');
    });
    return { key, reviewStatus: 'uzman-onayli' };
  }
}

const savingsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(92).default(30),
  soil: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('tinli'),
  intervalDays: z.coerce.number().int().min(1).max(60).optional(),
  depthMm: z.coerce.number().min(0).max(300).optional(),
  meteredPusulaM3: z.coerce.number().min(0).optional(),
  meteredTraditionalM3: z.coerce.number().min(0).optional(),
});

const pad = (n: number) => String(n).padStart(2, '0');

/** Tasarruf ve verim raporu (FAO-56 su dengesi; saf hesap packages/agro-core/savings.ts). */
@Controller('fields')
export class SavingsController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get(':id/savings')
  async savings(
    @Me() me: Principal,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    const q = parse(savingsQuerySchema, query);
    const ctx = await this.data.runOne(me, 'fields.savings', id, async (db) => {
      const [f] = await db.query<{
        id: string;
        name: string;
        lat: number | null;
        lon: number | null;
        areaDecare: number | null;
        cropId: string | null;
      }>(
        `SELECT id, name, lat, lon, area_decare::float8 AS "areaDecare", crop_id AS "cropId" FROM fields WHERE id = $1`,
        [id],
      );
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
      return { f, pack, soil, wp };
    });
    const { f, pack, soil, wp } = ctx;
    if (f.lat === null || f.lon === null) throw new BadRequestException('Tarlanın konumu yok');
    if (!this.weather.history) throw new ServiceUnavailableException('Hava geçmişi desteklenmiyor');
    let bundle;
    try {
      bundle = await this.weather.history(f.lat, f.lon, q.days);
    } catch (e) {
      if (e instanceof WeatherUnavailableError) throw new ServiceUnavailableException(e.message);
      throw e;
    }
    const today = `${this.now().getUTCFullYear()}-${pad(this.now().getUTCMonth() + 1)}-${pad(this.now().getUTCDate())}`;
    const days: SeasonDay[] = bundle.days
      .filter((d) => d.date < today)
      .slice(-q.days)
      .map((d) => ({
        date: d.date,
        et0: et0ForDay(d, { lat: f.lat! }, bundle.elevationM).mmPerDay,
        rainMm: d.precipMm ?? 0,
      }));

    const declared = q.intervalDays !== undefined && q.depthMm !== undefined;
    const traditional = declared
      ? { intervalDays: q.intervalDays!, depthMm: q.depthMm!, basis: 'beyan' as const }
      : ASSUMED_TRADITIONAL;

    const missingStatus: ReviewStatus = 'taslak-uzman-onayi-bekliyor';
    let result: SavingsResult;
    if (!pack || !soil || !wp) {
      result = {
        kind: 'none',
        reason: 'deger-yok',
        missing: [
          !pack ? 'Kc' : null,
          !soil ? 'toprak' : null,
          !wp ? 'kök derinliği ve tükenme oranı' : null,
        ].filter((x): x is string => x !== null),
      };
    } else {
      result = computeSavings({
        days,
        kc: { value: Number(pack.kcMid), reviewStatus: pack.reviewStatus },
        soil: {
          thetaFc: soil.thetaFc,
          thetaWp: soil.thetaWp,
          reviewStatus: soil.reviewStatus ?? missingStatus,
        },
        rootDepth: { valueM: wp.rootDepthM, reviewStatus: wp.reviewStatus },
        p: { value: wp.pTable, reviewStatus: wp.reviewStatus },
        areaDecare: f.areaDecare ?? 0,
        traditional,
        meteredPusulaM3: q.meteredPusulaM3 ?? null,
        meteredTraditionalM3: q.meteredTraditionalM3 ?? null,
      });
    }
    return {
      fieldId: f.id,
      fieldName: f.name,
      generatedAt: this.now().toISOString(),
      period: {
        from: days[0]?.date ?? null,
        to: days[days.length - 1]?.date ?? null,
        days: days.length,
      },
      method: 'FAO-56 su dengesi (Allen vd., 1998); packages/agro-core savings.ts',
      sources: {
        weather: { name: bundle.source, date: bundle.fetchedAt.slice(0, 10), version: 'günlük' },
        kc: pack
          ? {
              name: pack.source,
              date: new Date(pack.retrievedAt).toISOString().slice(0, 10),
              version: `paket v${pack.version} (${pack.sourceVersion})`,
            }
          : null,
        soil: soil
          ? { name: soil.source, date: soil.sourceDate, version: soil.sourceVersion }
          : null,
        waterParams: wp
          ? { name: wp.source, date: wp.sourceDate, version: wp.sourceVersion }
          : null,
      },
      singleKcNote: 'Dönem boyunca tek Kc (orta dönem değeri) kullanıldı.',
      result,
    };
  }
}

const reminderQuerySchema = z.object({
  moistureThreshold: z.coerce.number().gt(0).lt(1).optional(),
  dailyHour: z.coerce.number().int().min(0).max(23).optional(),
  moistureEnabled: z.enum(['0', '1']).optional(),
  dailyEnabled: z.enum(['0', '1']).optional(),
  soil: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('tinli'),
});

/**
 * Sulama hatırlatıcı kararı (G20.2): (a) sensör nemi kritik eşiğin altında, (b) günlük sulama ihtiyacı.
 * Girdiler (Kc, toprak, kök derinliği, p) ONAYLI değilse karar "onaysiz-veri" olur: hatırlatıcı yok.
 * Günlük ihtiyacın eksik su durumu TAHMİNDİR: son sulamadan (ya da 14 günden) beri sulama olmadığı varsayımıyla
 * ET ve yağıştan hesaplanır. Sessiz saat ve tekrar sınırı cihazda uygulanır (agro-core applyLimits).
 */
@Controller('fields')
export class RemindersController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get(':id/reminders')
  async reminders(
    @Me() me: Principal,
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    const q = parse(reminderQuerySchema, query);
    const prefs = sanitizeReminderPrefs({
      ...(q.moistureThreshold !== undefined ? { moistureThreshold: q.moistureThreshold } : {}),
      ...(q.dailyHour !== undefined ? { dailyHour: q.dailyHour } : {}),
      ...(q.moistureEnabled !== undefined ? { moistureEnabled: q.moistureEnabled === '1' } : {}),
      ...(q.dailyEnabled !== undefined ? { dailyEnabled: q.dailyEnabled === '1' } : {}),
    });
    const ctx = await this.data.runOne(me, 'fields.reminders', id, async (db) => {
      const [f] = await db.query<{
        id: string;
        lat: number | null;
        lon: number | null;
        areaDecare: number | null;
        cropId: string | null;
      }>(
        `SELECT id, lat, lon, area_decare::float8 AS "areaDecare", crop_id AS "cropId" FROM fields WHERE id = $1`,
        [id],
      );
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
      const sensors = await db.query<{ id: string }>(
        `SELECT id FROM devices WHERE field_id = $1 AND kind = 'nem-sensoru' ORDER BY created_at`,
        [id],
      );
      let latest: { theta: number; at: string } | null = null;
      for (const s of sensors) {
        const [r] = await db.query<{ value: number; at: Date }>(
          `SELECT value, at FROM device_readings WHERE device_id = $1 AND metric = 'soil-moisture'
           ORDER BY at DESC LIMIT 1`,
          [s.id],
        );
        if (r && (!latest || r.at.toISOString() > latest.at)) {
          latest = { theta: r.value, at: r.at.toISOString() };
        }
      }
      const [lastIrr] = await db.query<{ at: Date }>(
        `SELECT acked_at AS at FROM irrigation_commands
         WHERE field_id = $1 AND status = 'acked' AND action = 'open' AND acked_at IS NOT NULL
         ORDER BY acked_at DESC LIMIT 1`,
        [id],
      );
      return {
        f,
        pack,
        soil,
        wp,
        hasSensor: sensors.length > 0,
        latest,
        lastIrr: lastIrr?.at ?? null,
      };
    });
    const { f, pack, soil, wp, hasSensor, latest, lastIrr } = ctx;
    const now = this.now();
    const base = {
      fieldId: f.id,
      generatedAt: now.toISOString(),
      hasSensor,
      prefs,
    };
    if (!pack || !soil || !wp || f.lat === null || f.lon === null || !this.weather.history) {
      const none = { kind: 'none' as const, reason: 'veri-yok' as const };
      return {
        ...base,
        daily: none,
        moisture: hasSensor ? none : { kind: 'none', reason: 'cihaz-yok' },
        basis: null,
      };
    }
    let hist;
    let cur;
    try {
      [hist, cur] = await Promise.all([
        this.weather.history(f.lat, f.lon, 14),
        this.weather.get(f.lat, f.lon),
      ]);
    } catch (e) {
      if (e instanceof WeatherUnavailableError) throw new ServiceUnavailableException(e.message);
      throw e;
    }
    const today = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
    const sinceIso = lastIrr ? lastIrr.toISOString().slice(0, 10) : null;
    const past = hist.days
      .filter((d) => d.date < today && (!sinceIso || d.date > sinceIso))
      .map<SeasonDay>((d) => ({
        date: d.date,
        et0: et0ForDay(d, { lat: f.lat! }, hist.elevationM).mmPerDay,
        rainMm: d.precipMm ?? 0,
      }));
    const kc = Number(pack.kcMid);
    const taw = totalAvailableWater(soil.thetaFc, soil.thetaWp, wp.rootDepthM);
    const drYesterday = estimateDrEnd(past, { kc, taw, pTable: wp.pTable });
    const todayDay = cur.days.find((d) => d.date === today) ?? cur.days[0]!;
    const et0Today = et0ForDay(todayDay, { lat: f.lat }, cur.elevationM).mmPerDay;
    const decision = decideIrrigation({
      kc: { value: kc, reviewStatus: pack.reviewStatus },
      soil: { thetaFc: soil.thetaFc, thetaWp: soil.thetaWp, reviewStatus: soil.reviewStatus },
      rootDepth: { valueM: wp.rootDepthM, reviewStatus: wp.reviewStatus },
      p: { value: wp.pTable, reviewStatus: wp.reviewStatus },
      drYesterday,
      et0: et0Today,
      forecastRainMm: todayDay.precipMm ?? 0,
    });
    const daily = evaluateDailyReminder({ prefs, decision, areaDecare: f.areaDecare, now });
    const pAdj = adjustDepletionFraction(wp.pTable, cropEvapotranspiration(kc, et0Today));
    const moisture = evaluateMoistureReminder({
      prefs,
      hasSensor,
      reviews: [pack.reviewStatus, soil.reviewStatus, wp.reviewStatus, wp.reviewStatus],
      thetaFc: soil.thetaFc,
      thetaWp: soil.thetaWp,
      p: pAdj,
      latest,
      now,
    });
    return {
      ...base,
      daily,
      moisture,
      basis: {
        dailyIsEstimate: true,
        note: 'Eksik su tahmindir: son sulamadan (ya da 14 günden) beri sulama olmadığı varsayımıyla ET ve yağıştan hesaplandı.',
        windowDays: past.length,
        sinceIrrigation: sinceIso,
        sources: {
          weather: { name: hist.source, date: hist.fetchedAt.slice(0, 10) },
          kc: { name: pack.source, version: `paket v${pack.version}` },
          soil: { name: soil.source, version: soil.sourceVersion },
          waterParams: { name: wp.source, version: wp.sourceVersion },
        },
      },
    };
  }
}
