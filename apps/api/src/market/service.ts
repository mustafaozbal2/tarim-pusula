import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  haversineKm,
  netProfitRange,
  priceTrend,
  sourcedOnly,
  type NetRange,
  type PriceSource,
  type Trend,
} from '@tarim/agro-core';
import { trToday } from '../controllers.g4';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { CLOCK } from '../weather/tokens';

interface Row {
  placeId: string;
  place: string;
  lat: number | null;
  lon: number | null;
  approx: boolean;
  product: string;
  min: number;
  max: number;
  date: string;
  version: string;
  url: string;
  source: string;
}

export interface PlacePrice {
  placeId: string;
  name: string;
  product: string;
  /** (alt + üst) / 2, TL/kg */
  price: number;
  priceMin: number;
  priceMax: number;
  date: string;
  /** Veri güncel değil (günlük kaynak için 14, aylık için 45 günden eski). */
  stale: boolean;
  /** Kuş uçuşu, km. Tarla konumu ya da yer koordinatı yoksa null. */
  distanceKm: number | null;
  approxLocation: boolean;
  source: PriceSource;
  trend: Trend;
  /** Son 90 günün günlük fiyatlarından P10-P90 (TL/kg, kesintiler sonrası). */
  net: NetRange;
}

export interface MarketOverview {
  cropId: string;
  cropName: string;
  /** Başlık fiyat: en yeni tarihli kayıt. Hiç kaynaklı fiyat yoksa null (arayüz "fiyat yok" der). */
  current: PlacePrice | null;
  /** Koordinatı olan yerler: "nerede satarım". Mesafe varsa en yakın başta. */
  places: PlacePrice[];
  /** Koordinatsız (ulusal) referanslar. */
  national: PlacePrice[];
  /** Hesapta kullanılan kesintiler (kullanıcıdan gelmediyse null = hesaba katılmadı). */
  inputs: { transportTlPerTonKm: number | null; commissionRate: number | null };
}

const HISTORY_DAYS = 120;
const NET_DAYS = 90;
const DAY_MS = 86_400_000;
const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;
const dayDiff = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY_MS;

/** Pazar okuması. Fiyat kamusal veridir ama yine kullanıcı bağlamında okunur (yalnız SELECT yetkisi). */
@Injectable()
export class MarketService {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  crops(me: Principal) {
    return this.data.run(me, 'market.crops', (q) =>
      q.query<{ id: string; name: string }>(
        `SELECT DISTINCT c.id, c.name_tr AS name, c.common_rank AS rank
         FROM market_prices p JOIN crops c ON c.id = p.crop_id
         ORDER BY rank NULLS LAST, name`,
      ),
    );
  }

  async overview(
    me: Principal,
    cropId: string,
    opts: {
      fieldId?: string | undefined;
      transportTlPerTonKm?: number | null | undefined;
      commissionRate?: number | null | undefined;
    } = {},
  ): Promise<MarketOverview> {
    const transport = opts.transportTlPerTonKm ?? null;
    const commission = opts.commissionRate ?? null;
    if (transport !== null && !(transport >= 0 && transport <= 1000))
      throw new BadRequestException('transport 0..1000 TL/ton/km olmalı');
    if (commission !== null && !(commission >= 0 && commission < 1))
      throw new BadRequestException('commission 0 ile 1 arasında olmalı');
    const today = trToday(this.now());

    const field = opts.fieldId
      ? await this.data.runOne(me, 'market.field', opts.fieldId, async (q) => {
          const [f] = await q.query<{ lat: number | null; lon: number | null }>(
            'SELECT lat, lon FROM fields WHERE id = $1',
            [opts.fieldId],
          );
          return f;
        })
      : null;

    const { rows, cropName } = await this.data.run(me, 'market.prices', async (q) => {
      const [c] = await q.query<{ name: string }>(
        'SELECT name_tr AS name FROM crops WHERE id = $1',
        [cropId],
      );
      const rows = await q.query<Row>(
        `SELECT p.place_id AS "placeId", pl.name AS place, pl.lat, pl.lon, pl.approx,
                p.product_name AS product, p.price_min::float8 AS min, p.price_max::float8 AS max,
                p.price_date::text AS date, p.source_version AS version, p.source_url AS url, s.name AS source
         FROM market_prices p
         JOIN market_places pl ON pl.id = p.place_id
         JOIN market_sources s ON s.id = p.source_id
         WHERE p.crop_id = $1 AND p.price_date >= ($2::date - $3::int) AND p.price_date <= $2::date
         ORDER BY p.price_date DESC`,
        [cropId, today, HISTORY_DAYS],
      );
      return { rows, cropName: c?.name ?? cropId };
    });

    // Kaynak künyesi eksik hiçbir satır gösterime giremez.
    const withSource = sourcedOnly(
      rows.map((r) => ({
        ...r,
        price: mid(r),
        source: { name: r.source, date: r.date, version: r.version, url: r.url } as PriceSource,
      })),
    );

    // (yer, ürün) serileri; her yer için en çok günü olan ürün (eşitse en yeni) seçilir.
    const series = new Map<string, typeof withSource>();
    for (const r of withSource) {
      const k = `${r.placeId}|${r.product}`;
      series.set(k, [...(series.get(k) ?? []), r]);
    }
    const byPlace = new Map<string, typeof withSource>();
    for (const s of series.values()) {
      const cur = byPlace.get(s[0]!.placeId);
      const days = (x: typeof s) => new Set(x.map((r) => r.date)).size;
      if (!cur || days(s) > days(cur) || (days(s) === days(cur) && s[0]!.date > cur[0]!.date))
        byPlace.set(s[0]!.placeId, s);
    }

    const items: PlacePrice[] = [];
    for (const s of byPlace.values()) {
      const latest = s[0]!; // tarihe göre azalan
      const dates = [...new Set(s.map((r) => r.date))].sort();
      const gaps = dates.slice(1).map((d, i) => dayDiff(d, dates[i]!));
      const monthly =
        gaps.length > 0
          ? gaps.reduce((a, b) => a + b, 0) / gaps.length >= 20
          : latest.placeId.startsWith('tepge');
      const distanceKm =
        field &&
        field.lat !== null &&
        field.lon !== null &&
        latest.lat !== null &&
        latest.lon !== null
          ? haversineKm(field.lat, field.lon, latest.lat, latest.lon)
          : null;
      const recent = s.filter((r) => dayDiff(today, r.date) <= NET_DAYS);
      items.push({
        placeId: latest.placeId,
        name: latest.place,
        product: latest.product,
        price: latest.price,
        priceMin: latest.min,
        priceMax: latest.max,
        date: latest.date,
        stale: dayDiff(today, latest.date) > (monthly ? 45 : 14),
        distanceKm,
        approxLocation: latest.approx,
        source: latest.source,
        trend: priceTrend(s.map((r) => ({ price: r.price, date: r.date }))),
        net: netProfitRange({
          prices: recent.map((r) => r.price),
          transportTlPerTonKm: transport,
          distanceKm,
          commissionRate: commission,
        }),
      });
    }

    const withCoords = new Set(
      [...byPlace.values()].filter((s) => s[0]!.lat !== null).map((s) => s[0]!.placeId),
    );
    const places = items
      .filter((i) => withCoords.has(i.placeId))
      .sort((a, b) =>
        a.distanceKm !== null && b.distanceKm !== null
          ? a.distanceKm - b.distanceKm
          : a.distanceKm !== null
            ? -1
            : b.distanceKm !== null
              ? 1
              : b.price - a.price,
      );
    const national = items.filter((i) => !withCoords.has(i.placeId));
    // Başlık: en yeni tarih; eşitlikte güncel olan ve konumlu/yakın olan.
    const current =
      [...items].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          Number(withCoords.has(b.placeId)) - Number(withCoords.has(a.placeId)) ||
          (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
      )[0] ?? null;

    return {
      cropId,
      cropName,
      current,
      places,
      national,
      inputs: { transportTlPerTonKm: transport, commissionRate: commission },
    };
  }
}
