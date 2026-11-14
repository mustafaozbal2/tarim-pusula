import type { SaatlikHava } from './gece';
/**
 * Open-Meteo istemcisi (https://open-meteo.com). Veri CC BY 4.0; ticari kullanım için ücretli plan gerekir
 * (docs/RISKLER.md). Her yanıt kaynak + çekilme tarihi taşır (değişmez kural 6).
 */
export interface DailyWeather {
  /** Yerel takvim günü (YYYY-MM-DD). */
  date: string;
  tMinC: number;
  tMaxC: number;
  shortwaveMjM2: number | null;
  rhMeanPct: number | null;
  windMeanMs: number | null;
  precipMm: number | null;
  /** Open-Meteo'nun kendi ET0 değeri; yalnız karşılaştırma içindir, kararda kullanılmaz. */
  et0OpenMeteoMm: number | null;
  /** Günlük kar yağışı (cm) ve en büyük rüzgâr hamlesi (m/s); sağlayıcı vermezse yok. */
  snowCm?: number | null;
  gustMaxMs?: number | null;
}

export interface EnsembleDay {
  date: string;
  /** Ensemble üyelerinin günlük en düşük sıcaklıkları (°C). */
  minC: number[];
}

/** Şu anki hava (Open-Meteo `current`). Ek alanlar sağlayıcı vermezse null. */
export interface CurrentWeather {
  time: string;
  tempC: number;
  weatherCode: number;
  /** Hissedilen sıcaklık (°C). */
  apparentC?: number | null;
  /** Bağıl nem (%). */
  rhPct?: number | null;
  /** 10 m rüzgâr hızı (m/s). */
  windMs?: number | null;
  /** Son saatteki yağış (mm). */
  precipMm?: number | null;
}

export interface WeatherBundle {
  source: string;
  /** Veri sürümü (API sürümü ve model); kaynak + tarih + sürüm birlikte saklanır (kural 6). */
  version?: string;
  /** Örnek veri: gerçek sağlayıcıya ulaşılamadı ya da demo/test sahte sağlayıcısı. */
  sample?: boolean;
  fetchedAt: string;
  /** Sunucuya ulaşılamadı, önbellekteki eski veri döndü. */
  stale: boolean;
  /** Open-Meteo'nun bu nokta için kullandığı yükseklik (m). */
  elevationM: number;
  utcOffsetSeconds: number;
  current: CurrentWeather | null;
  days: DailyWeather[];
  /** Saatlik tahmin (yerel saat); gece donu penceresi için. */
  hourly?: SaatlikHava[];
  ensemble: { model: string; elevationM: number; days: EnsembleDay[] } | null;
}

export interface WeatherProvider {
  get(lat: number, lon: number): Promise<WeatherBundle>;
  /**
   * Geçmiş günlük gözlem/analiz (son `pastDays` gün, bugün hariç). Tasarruf raporu gibi dönem
   * hesapları için. Sağlayıcı desteklemezse tanımsız olabilir.
   */
  history?(lat: number, lon: number, pastDays: number): Promise<WeatherBundle>;
  /**
   * İkiz Tarım paketi: geçmiş pencere + 16 günlük tahmin, topluluk üyelerinin günlük yağış/ET0'ı ve
   * sezon başından beri sıcaklıklar (derece-gün). Sağlayıcı desteklemezse tanımsız olabilir.
   */
  twin?(lat: number, lon: number, seasonFrom: string): Promise<TwinWeather>;
}

export interface TwinWeather {
  source: string;
  version: string;
  sample: boolean;
  fetchedAt: string;
  stale: boolean;
  elevationM: number;
  utcOffsetSeconds: number;
  /** Geçmiş pencere (TWIN_PAST_DAYS gün) + bugün + tahmin günleri, tarih sırasıyla. */
  days: DailyWeather[];
  /** Topluluk üyeleri (yalnız tahmin günleri): aynı sıradaki üye aynı senaryo yoludur. */
  members: { date: string; et0: number[]; rainMm: number[] }[];
  /** Sezon başından pencere başına kadar günlük sıcaklıklar (derece-gün için; arşiv). */
  season: { date: string; tMinC: number; tMaxC: number }[];
}

export const TWIN_PAST_DAYS = 60;
export const TWIN_FORECAST_DAYS = 16;

export class WeatherUnavailableError extends Error {
  constructor(detail: string) {
    super(`Hava verisi alınamadı: ${detail}`);
    this.name = 'WeatherUnavailableError';
  }
}

export interface OpenMeteoOptions {
  fetchImpl?: typeof fetch;
  /** Ücretli plan anahtarı (.env: OPEN_METEO_API_KEY). Yoksa ücretsiz uç kullanılır. */
  apiKey?: string;
  ttlMs?: number;
  timeoutMs?: number;
  now?: () => number;
  ensembleModel?: string;
  forecastDays?: number;
}

const SOURCE = 'Open-Meteo (open-meteo.com, CC BY 4.0)';
const DAILY =
  'temperature_2m_max,temperature_2m_min,shortwave_radiation_sum,relative_humidity_2m_mean,wind_speed_10m_mean,precipitation_sum,et0_fao_evapotranspiration,snowfall_sum,wind_gusts_10m_max';
const HOURLY = 'temperature_2m,dew_point_2m,wind_speed_10m,cloud_cover,snowfall,precipitation';

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export class OpenMeteoClient implements WeatherProvider {
  private readonly cache = new Map<string, { at: number; bundle: WeatherBundle }>();
  private readonly twinCache = new Map<string, { at: number; bundle: TwinWeather }>();
  private readonly doFetch: typeof fetch;
  private readonly ttl: number;
  private readonly now: () => number;

  constructor(private readonly opts: OpenMeteoOptions = {}) {
    this.doFetch = opts.fetchImpl ?? fetch;
    this.ttl = opts.ttlMs ?? 30 * 60_000;
    this.now = opts.now ?? Date.now;
  }

  async get(lat: number, lon: number): Promise<WeatherBundle> {
    // ~5 km ızgara: yakın tarlalar aynı isteği paylaşır, çağrı sayısı (lisans sınırı) düşer.
    const key = `${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lon * 20) / 20).toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttl) return hit.bundle;
    try {
      const bundle = await this.fetchBundle(lat, lon);
      this.cache.set(key, { at: this.now(), bundle });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
      return bundle;
    } catch (e) {
      if (hit) return { ...hit.bundle, stale: true };
      throw e instanceof WeatherUnavailableError ? e : new WeatherUnavailableError(String(e));
    }
  }

  /** Open-Meteo `past_days` ile geçmiş günlük veri (en çok 92 gün). */
  async history(lat: number, lon: number, pastDays: number): Promise<WeatherBundle> {
    const n = Math.max(1, Math.min(92, Math.floor(pastDays)));
    const key = `h:${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lon * 20) / 20).toFixed(2)},${n}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttl) return hit.bundle;
    try {
      const forecast = await this.getJson('https://api.open-meteo.com', '/v1/forecast', {
        latitude: String(lat),
        longitude: String(lon),
        timezone: 'auto',
        daily: DAILY,
        wind_speed_unit: 'ms',
        past_days: String(n),
        forecast_days: '1',
      });
      const bundle = parseBundle(forecast, null, 'none', new Date(this.now()).toISOString());
      this.cache.set(key, { at: this.now(), bundle });
      return bundle;
    } catch (e) {
      if (hit) return { ...hit.bundle, stale: true };
      throw e instanceof WeatherUnavailableError ? e : new WeatherUnavailableError(String(e));
    }
  }

  /** İkiz Tarım: tahmin (past_days + 16 gün) + topluluk (yağış, ET0) + arşiv (sezon sıcaklıkları). */
  async twin(lat: number, lon: number, seasonFrom: string): Promise<TwinWeather> {
    const key = `t:${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lon * 20) / 20).toFixed(2)},${seasonFrom}`;
    const hit = this.twinCache.get(key);
    if (hit && this.now() - hit.at < this.ttl) return hit.bundle;
    const loc = { latitude: String(lat), longitude: String(lon), timezone: 'auto' };
    const model = this.opts.ensembleModel ?? 'icon_seamless';
    const archiveEnd = new Date(this.now() - (TWIN_PAST_DAYS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    try {
      const [forecast, ens, archive] = await Promise.all([
        this.getJson('https://api.open-meteo.com', '/v1/forecast', {
          ...loc,
          daily: DAILY,
          wind_speed_unit: 'ms',
          past_days: String(TWIN_PAST_DAYS),
          forecast_days: String(TWIN_FORECAST_DAYS),
        }),
        this.getJson('https://ensemble-api.open-meteo.com', '/v1/ensemble', {
          ...loc,
          daily: 'precipitation_sum,et0_fao_evapotranspiration',
          models: model,
          forecast_days: String(TWIN_FORECAST_DAYS),
        }).catch(() => null),
        seasonFrom < archiveEnd
          ? this.getJson('https://archive-api.open-meteo.com', '/v1/archive', {
              ...loc,
              daily: 'temperature_2m_max,temperature_2m_min',
              start_date: seasonFrom,
              end_date: archiveEnd,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const bundle = parseTwin(forecast, ens, archive, model, new Date(this.now()).toISOString());
      this.twinCache.set(key, { at: this.now(), bundle });
      if (this.twinCache.size > 200)
        this.twinCache.delete(this.twinCache.keys().next().value as string);
      return bundle;
    } catch (e) {
      if (hit) return { ...hit.bundle, stale: true };
      throw e instanceof WeatherUnavailableError ? e : new WeatherUnavailableError(String(e));
    }
  }

  private async getJson(host: string, path: string, params: Record<string, string>): Promise<Json> {
    const qs = new URLSearchParams({
      ...params,
      ...(this.opts.apiKey ? { apikey: this.opts.apiKey } : {}),
    });
    const base = this.opts.apiKey ? host.replace('://', '://customer-') : host;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await this.doFetch(`${base}${path}?${qs}`, { signal: ctrl.signal });
      if (!res.ok) throw new WeatherUnavailableError(`HTTP ${res.status}`);
      return (await res.json()) as Json;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchBundle(lat: number, lon: number): Promise<WeatherBundle> {
    const days = String(this.opts.forecastDays ?? 7);
    const loc = { latitude: String(lat), longitude: String(lon), timezone: 'auto' };
    const model = this.opts.ensembleModel ?? 'icon_seamless';
    const [forecast, ens] = await Promise.all([
      this.getJson('https://api.open-meteo.com', '/v1/forecast', {
        ...loc,
        daily: DAILY,
        current:
          'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code',
        hourly: HOURLY,
        wind_speed_unit: 'ms',
        forecast_days: days,
      }),
      // Ensemble hatası ölümcül değil: yalnız don olasılığı "veri yok" olur.
      this.getJson('https://ensemble-api.open-meteo.com', '/v1/ensemble', {
        ...loc,
        daily: 'temperature_2m_min',
        models: model,
        forecast_days: days,
      }).catch(() => null),
    ]);
    return parseBundle(forecast, ens, model, new Date(this.now()).toISOString());
  }
}

export function parseBundle(
  forecast: Json,
  ens: Json | null,
  model: string,
  fetchedAt: string,
): WeatherBundle {
  const d = (forecast['daily'] ?? {}) as Json;
  const dates = arr(d['time']) as string[];
  if (dates.length === 0) throw new WeatherUnavailableError('boş tahmin');
  const col = (name: string) => arr(d[name]);
  // Uzun pencerede (past_days + 16 gün) son günler bazen boş gelir: o günler atlanır; hiç gün kalmazsa hata.
  const days: DailyWeather[] = dates.flatMap((date, i) => {
    const tMin = num(col('temperature_2m_min')[i]);
    const tMax = num(col('temperature_2m_max')[i]);
    if (tMin === null || tMax === null) return [];
    return {
      date,
      tMinC: tMin,
      tMaxC: tMax,
      shortwaveMjM2: num(col('shortwave_radiation_sum')[i]),
      rhMeanPct: num(col('relative_humidity_2m_mean')[i]),
      windMeanMs: num(col('wind_speed_10m_mean')[i]),
      precipMm: num(col('precipitation_sum')[i]),
      et0OpenMeteoMm: num(col('et0_fao_evapotranspiration')[i]),
      snowCm: num(col('snowfall_sum')[i]),
      gustMaxMs: num(col('wind_gusts_10m_max')[i]),
    } satisfies DailyWeather;
  });
  if (days.length === 0) throw new WeatherUnavailableError('sıcaklık verisi yok');
  const h = (forecast['hourly'] ?? null) as Json | null;
  const hcol = (name: string) => arr(h?.[name]);
  const hourly: SaatlikHava[] = (arr(h?.['time']) as string[]).map((time, i) => ({
    time,
    tempC: num(hcol('temperature_2m')[i]),
    dewC: num(hcol('dew_point_2m')[i]),
    windMs: num(hcol('wind_speed_10m')[i]),
    cloudPct: num(hcol('cloud_cover')[i]),
    snowCm: num(hcol('snowfall')[i]),
    precipMm: num(hcol('precipitation')[i]),
  }));
  const cur = forecast['current'] as Json | undefined;
  const t = num(cur?.['temperature_2m']);
  const code = num(cur?.['weather_code']);

  let ensemble: WeatherBundle['ensemble'] = null;
  const ed = (ens?.['daily'] ?? null) as Json | null;
  if (ed) {
    const edates = arr(ed['time']) as string[];
    const keys = Object.keys(ed).filter((k) => k.startsWith('temperature_2m_min'));
    const eDays = edates.map((date, i) => ({
      date,
      minC: keys.map((k) => num(arr(ed[k])[i])).filter((v): v is number => v !== null),
    }));
    if (eDays.some((x) => x.minC.length > 0)) {
      ensemble = {
        model,
        elevationM: num(ens?.['elevation']) ?? num(forecast['elevation']) ?? 0,
        days: eDays,
      };
    }
  }
  return {
    source: SOURCE,
    version: `Open-Meteo API v1 (forecast; ensemble ${model})`,
    sample: false,
    fetchedAt,
    stale: false,
    elevationM: num(forecast['elevation']) ?? 0,
    utcOffsetSeconds: num(forecast['utc_offset_seconds']) ?? 0,
    current:
      t !== null && code !== null
        ? {
            time: String(cur?.['time'] ?? ''),
            tempC: t,
            weatherCode: code,
            apparentC: num(cur?.['apparent_temperature']),
            rhPct: num(cur?.['relative_humidity_2m']),
            windMs: num(cur?.['wind_speed_10m']),
            precipMm: num(cur?.['precipitation']),
          }
        : null,
    days,
    ...(hourly.length ? { hourly } : {}),
    ensemble,
  };
}

/** İkiz paketi ayrıştırma: günlük seri parseBundle ile; topluluk üyeleri sütun adından (…_memberNN). */
export function parseTwin(
  forecast: Json,
  ens: Json | null,
  archive: Json | null,
  model: string,
  fetchedAt: string,
): TwinWeather {
  const b = parseBundle(forecast, null, model, fetchedAt);
  const members: TwinWeather['members'] = [];
  const ed = (ens?.['daily'] ?? null) as Json | null;
  if (ed) {
    const dates = arr(ed['time']) as string[];
    const rainKeys = Object.keys(ed).filter((k) => /^precipitation_sum_member\d+$/.test(k));
    const et0Keys = Object.keys(ed).filter((k) => /^et0_fao_evapotranspiration_member\d+$/.test(k));
    const n = Math.min(rainKeys.length, et0Keys.length);
    dates.forEach((date, i) => {
      const et0: number[] = [];
      const rainMm: number[] = [];
      for (let k = 0; k < n; k++) {
        const e = num(arr(ed[et0Keys[k]!])[i]);
        const r = num(arr(ed[rainKeys[k]!])[i]);
        if (e !== null && r !== null) {
          et0.push(e);
          rainMm.push(r);
        }
      }
      if (et0.length > 0) members.push({ date, et0, rainMm });
    });
  }
  const season: TwinWeather['season'] = [];
  const ad = (archive?.['daily'] ?? null) as Json | null;
  if (ad) {
    const dates = arr(ad['time']) as string[];
    dates.forEach((date, i) => {
      const tMin = num(arr(ad['temperature_2m_min'])[i]);
      const tMax = num(arr(ad['temperature_2m_max'])[i]);
      if (tMin !== null && tMax !== null) season.push({ date, tMinC: tMin, tMaxC: tMax });
    });
  }
  return {
    source: SOURCE,
    version: `Open-Meteo API v1 (forecast past_days; ensemble ${model}; archive ERA5)`,
    sample: false,
    fetchedAt,
    stale: false,
    elevationM: b.elevationM,
    utcOffsetSeconds: b.utcOffsetSeconds,
    days: b.days,
    members,
    season,
  };
}

/** Ağ ya da anahtar olmadan çalışmak için sahte sağlayıcı (geliştirme, test, e2e). */
export class FakeWeatherProvider implements WeatherProvider {
  calls = 0;
  constructor(
    private readonly make: (lat: number, lon: number) => WeatherBundle = (lat, lon) =>
      sampleBundle(lat, lon),
  ) {}
  async get(lat: number, lon: number): Promise<WeatherBundle> {
    this.calls++;
    return this.make(lat, lon);
  }
  /** Sahte geçmiş: belirlenimli, bugünden geriye `pastDays` gün (ET0 girdileri sabit). */
  async history(lat: number, lon: number, pastDays: number): Promise<WeatherBundle> {
    const b = this.make(lat, lon);
    const base = b.days[0]!;
    const end = new Date(`${base.date}T00:00:00Z`).getTime();
    const days = Array.from({ length: Math.max(1, pastDays) }, (_, i) => {
      const date = new Date(end - (pastDays - i) * 86_400_000).toISOString().slice(0, 10);
      return { ...base, date };
    });
    return { ...b, days };
  }
  /** Sahte ikiz paketi: 60 gün geçmiş + 16 gün tahmin, 5 sabit üye; 3 günde bir 6 mm yağış. */
  async twin(lat: number, lon: number, seasonFrom: string): Promise<TwinWeather> {
    const b = this.make(lat, lon);
    const base = b.days[0]!;
    const t0 = new Date(`${base.date}T00:00:00Z`).getTime();
    const at = (k: number) => new Date(t0 + k * 86_400_000).toISOString().slice(0, 10);
    const days: DailyWeather[] = [];
    for (let k = -TWIN_PAST_DAYS; k < TWIN_FORECAST_DAYS; k++) {
      days.push({ ...base, date: at(k), precipMm: k % 3 === 0 ? 6 : 0 });
    }
    const members = Array.from({ length: TWIN_FORECAST_DAYS }, (_, k) => ({
      date: at(k),
      et0: [2.2, 2.5, 2.7, 3.0, 3.3],
      rainMm: k % 3 === 0 ? [0, 2, 6, 10, 14] : [0, 0, 0, 0, 1],
    }));
    const season: TwinWeather['season'] = [];
    const from = new Date(`${seasonFrom}T00:00:00Z`).getTime();
    for (let t = from; t < t0 - TWIN_PAST_DAYS * 86_400_000; t += 86_400_000) {
      season.push({ date: new Date(t).toISOString().slice(0, 10), tMinC: 8, tMaxC: 22 });
    }
    return {
      source: b.source,
      version: b.version ?? 'ornek',
      sample: true,
      fetchedAt: b.fetchedAt,
      stale: false,
      elevationM: b.elevationM,
      utcOffsetSeconds: b.utcOffsetSeconds,
      days,
      members,
      season,
    };
  }
}

export interface SampleOptions {
  now?: Date;
  /** Ensemble üyelerinin sabit en düşük sıcaklık değerleri (her gün aynı). */
  memberMinC?: number[];
  elevationM?: number;
}

/** Deterministik örnek paket: bugünden başlayan 5 gün, TSİ (UTC+3). */
export function sampleBundle(_lat: number, _lon: number, o: SampleOptions = {}): WeatherBundle {
  const now = o.now ?? new Date();
  const offset = 3 * 3600;
  const local = new Date(now.getTime() + offset * 1000);
  const members = o.memberMinC ?? Array.from({ length: 51 }, (_, i) => 6 + (i % 5) * 0.5);
  const days = Array.from({ length: 5 }, (_, i) => {
    const date = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i),
    )
      .toISOString()
      .slice(0, 10);
    return { date, minC: members };
  });
  return {
    source: 'Open-Meteo (örnek veri)',
    version: 'ornek-v1',
    sample: true,
    fetchedAt: now.toISOString(),
    stale: false,
    elevationM: o.elevationM ?? 800,
    utcOffsetSeconds: offset,
    current: {
      time: now.toISOString(),
      tempC: 12,
      weatherCode: 2,
      apparentC: 11,
      rhPct: 60,
      windMs: 1.5,
      precipMm: 0,
    },
    days: days.map((d) => ({
      date: d.date,
      tMinC: 8,
      tMaxC: 22,
      shortwaveMjM2: 15,
      rhMeanPct: 60,
      windMeanMs: 1.5,
      precipMm: 0,
      et0OpenMeteoMm: 2.7,
    })),
    ensemble: { model: 'sample', elevationM: o.elevationM ?? 800, days },
  };
}

/**
 * Önce gerçek sağlayıcı (Open-Meteo); hata ya da ağ yoksa yedek (örnek) pakete düşer. Yedek paket
 * `sample: true` ve "Örnek veri" kaynağıyla döner; ekranda etiketlenir (demo sunucusu, G22.6).
 */
export class FallbackWeatherProvider implements WeatherProvider {
  fallbacks = 0;
  constructor(
    private readonly primary: WeatherProvider,
    private readonly fallback: WeatherProvider = new FakeWeatherProvider(),
  ) {}
  /** Son hatanın kısa sebebi (tanı için; ör. "HTTP 429"). */
  lastError: string | null = null;
  /**
   * Yedek örnek veri: kaynak "Örnek veri" yazılır ve topluluk (ensemble) verisi ÇIKARILIR. Gerçek
   * havaya ulaşılamadığında çiftçiye örnek veriden don uyarısı gitmez (yanlış alarm olurdu).
   */
  private mark(b: WeatherBundle, e?: unknown): WeatherBundle {
    this.fallbacks++;
    if (e !== undefined)
      this.lastError = (e instanceof Error ? e.message : String(e))
        .replace(/Hava verisi alınamadı: /g, '')
        .slice(0, 120);
    const why = this.lastError ? `: ${this.lastError}` : '';
    return {
      ...b,
      sample: true,
      ensemble: null,
      source: `Örnek veri (Open-Meteo şu an erişilemedi${why})`,
    };
  }
  async get(lat: number, lon: number): Promise<WeatherBundle> {
    try {
      return await this.primary.get(lat, lon);
    } catch (e) {
      console.warn('hava: Open-Meteo erişilemedi, örnek veri:', e instanceof Error ? e.message : e);
      return this.mark(await this.fallback.get(lat, lon), e);
    }
  }
  async twin(lat: number, lon: number, seasonFrom: string): Promise<TwinWeather> {
    try {
      if (!this.primary.twin) throw new WeatherUnavailableError('ikiz paketi yok');
      return await this.primary.twin(lat, lon, seasonFrom);
    } catch (e) {
      if (!this.fallback.twin) throw new WeatherUnavailableError('ikiz paketi yok');
      const t = await this.fallback.twin(lat, lon, seasonFrom);
      this.fallbacks++;
      const why = (e instanceof Error ? e.message : String(e)).replace(
        /Hava verisi alınamadı: /g,
        '',
      );
      return {
        ...t,
        sample: true,
        source: `Örnek veri (Open-Meteo şu an erişilemedi: ${why.slice(0, 120)})`,
      };
    }
  }
  async history(lat: number, lon: number, pastDays: number): Promise<WeatherBundle> {
    try {
      if (!this.primary.history) throw new WeatherUnavailableError('geçmiş yok');
      return await this.primary.history(lat, lon, pastDays);
    } catch (e) {
      if (!this.fallback.history) throw new WeatherUnavailableError('geçmiş yok');
      return this.mark(await this.fallback.history(lat, lon, pastDays), e);
    }
  }
}
