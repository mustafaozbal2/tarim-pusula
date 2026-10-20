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
}

export interface EnsembleDay {
  date: string;
  /** Ensemble üyelerinin günlük en düşük sıcaklıkları (°C). */
  minC: number[];
}

export interface WeatherBundle {
  source: string;
  fetchedAt: string;
  /** Sunucuya ulaşılamadı, önbellekteki eski veri döndü. */
  stale: boolean;
  /** Open-Meteo'nun bu nokta için kullandığı yükseklik (m). */
  elevationM: number;
  utcOffsetSeconds: number;
  current: { time: string; tempC: number; weatherCode: number } | null;
  days: DailyWeather[];
  ensemble: { model: string; elevationM: number; days: EnsembleDay[] } | null;
}

export interface WeatherProvider {
  get(lat: number, lon: number): Promise<WeatherBundle>;
}

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
  'temperature_2m_max,temperature_2m_min,shortwave_radiation_sum,relative_humidity_2m_mean,wind_speed_10m_mean,precipitation_sum,et0_fao_evapotranspiration';

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export class OpenMeteoClient implements WeatherProvider {
  private readonly cache = new Map<string, { at: number; bundle: WeatherBundle }>();
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
    const days = String(this.opts.forecastDays ?? 5);
    const loc = { latitude: String(lat), longitude: String(lon), timezone: 'auto' };
    const model = this.opts.ensembleModel ?? 'icon_seamless';
    const [forecast, ens] = await Promise.all([
      this.getJson('https://api.open-meteo.com', '/v1/forecast', {
        ...loc,
        daily: DAILY,
        current: 'temperature_2m,weather_code',
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
  const days: DailyWeather[] = dates.map((date, i) => {
    const tMin = num(col('temperature_2m_min')[i]);
    const tMax = num(col('temperature_2m_max')[i]);
    if (tMin === null || tMax === null)
      throw new WeatherUnavailableError(`${date} sıcaklığı eksik`);
    return {
      date,
      tMinC: tMin,
      tMaxC: tMax,
      shortwaveMjM2: num(col('shortwave_radiation_sum')[i]),
      rhMeanPct: num(col('relative_humidity_2m_mean')[i]),
      windMeanMs: num(col('wind_speed_10m_mean')[i]),
      precipMm: num(col('precipitation_sum')[i]),
      et0OpenMeteoMm: num(col('et0_fao_evapotranspiration')[i]),
    };
  });
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
    fetchedAt,
    stale: false,
    elevationM: num(forecast['elevation']) ?? 0,
    utcOffsetSeconds: num(forecast['utc_offset_seconds']) ?? 0,
    current:
      t !== null && code !== null
        ? { time: String(cur?.['time'] ?? ''), tempC: t, weatherCode: code }
        : null,
    days,
    ensemble,
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
    fetchedAt: now.toISOString(),
    stale: false,
    elevationM: o.elevationM ?? 800,
    utcOffsetSeconds: offset,
    current: { time: now.toISOString(), tempC: 12, weatherCode: 2 },
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
