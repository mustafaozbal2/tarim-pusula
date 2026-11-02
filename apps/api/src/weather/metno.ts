import {
  WeatherUnavailableError,
  type DailyWeather,
  type WeatherBundle,
  type WeatherProvider,
} from './openmeteo';

/**
 * MET Norway Locationforecast 2.0 (yr.no; https://api.met.no/weatherapi/locationforecast/2.0/documentation).
 * Ücretsiz, anahtarsız; kullanım şartı: tanımlayıcı User-Agent ve önbellek. Lisans: CC BY 4.0 (MET Norway).
 * Open-Meteo ulaşılamadığında (ör. paylaşılan bulut IP'sinde HTTP 429) GERÇEK hava için ikinci kaynaktır.
 * Saatlik değerlerden yerel güne göre günlük en düşük/en yüksek, yağış toplamı, ortalama nem ve rüzgâr
 * çıkarılır. Radyasyon vermez: ET0 (FAO-56) radyasyonu sıcaklık farkından tahmin eder. Topluluk
 * (ensemble) verisi yoktur; don olasılığı bu kaynakla "veri yok" kalır (tek tahminden olasılık uydurulmaz).
 */
export const METNO_SOURCE = 'MET Norway Locationforecast 2.0 (yr.no, CC BY 4.0)';
const UA = 'TarimPusula/0.1 github.com/mustafaozbal2/tarim-pusula';

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** MET sembol kodu → WMO hava kodu (Open-Meteo ile aynı ölçek; ekran ve efektler aynı çalışsın). */
export function symbolToWmo(symbol: string | null | undefined): number {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  if (s.includes('snowshowers')) return 85;
  if (s.includes('snow')) return s.startsWith('heavy') ? 75 : s.startsWith('light') ? 71 : 73;
  if (s.includes('sleet')) return 66;
  if (s.includes('rainshowers')) return s.startsWith('heavy') ? 82 : 80;
  if (s.includes('rain')) return s.startsWith('heavy') ? 65 : s.startsWith('light') ? 61 : 63;
  if (s === 'fog') return 45;
  if (s === 'cloudy') return 3;
  if (s === 'partlycloudy') return 2;
  if (s === 'fair') return 1;
  return 0; // clearsky ve bilinmeyen
}

/**
 * Yerel saat farkı (sn). Türkiye tüm yıl UTC+3 (2016'dan beri yaz saati yok); sınırları dışındaysa
 * boylamdan yaklaşık (15° = 1 saat).
 */
export function utcOffsetFor(lat: number, lon: number): number {
  const turkiye = lat >= 35.8 && lat <= 42.2 && lon >= 25.6 && lon <= 44.9;
  return turkiye ? 3 * 3600 : Math.round(lon / 15) * 3600;
}

export function parseMetno(j: Json, lat: number, lon: number, fetchedAt: string): WeatherBundle {
  const props = (j['properties'] ?? {}) as Json;
  const series = (Array.isArray(props['timeseries']) ? props['timeseries'] : []) as Json[];
  if (series.length === 0) throw new WeatherUnavailableError('MET: boş tahmin');
  const off = utcOffsetFor(lat, lon);
  const coords = ((j['geometry'] as Json | undefined)?.['coordinates'] ?? []) as unknown[];
  const elevationM = num(coords[2]) ?? 0;

  const byDay = new Map<string, { t: number[]; rh: number[]; w: number[]; p: number }>();
  for (const e of series) {
    const time = Date.parse(String(e['time']));
    if (!Number.isFinite(time)) continue;
    const date = new Date(time + off * 1000).toISOString().slice(0, 10);
    const data = (e['data'] ?? {}) as Json;
    const det = ((data['instant'] as Json | undefined)?.['details'] ?? {}) as Json;
    const d = byDay.get(date) ?? { t: [], rh: [], w: [], p: 0 };
    const t = num(det['air_temperature']);
    if (t !== null) d.t.push(t);
    const rh = num(det['relative_humidity']);
    if (rh !== null) d.rh.push(rh);
    const w = num(det['wind_speed']);
    if (w !== null) d.w.push(w);
    // Saatlik yağış varsa o; yoksa (ileri günlerde 6 saatlik adım) 6 saatlik toplam. Çift sayılmaz.
    const p1 = num(
      ((data['next_1_hours'] as Json | undefined)?.['details'] as Json | undefined)?.[
        'precipitation_amount'
      ],
    );
    const p6 = num(
      ((data['next_6_hours'] as Json | undefined)?.['details'] as Json | undefined)?.[
        'precipitation_amount'
      ],
    );
    if (p1 !== null) d.p += p1;
    else if (p6 !== null) d.p += p6;
    byDay.set(date, d);
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const days: DailyWeather[] = [...byDay.entries()]
    .filter(([, d]) => d.t.length >= 2)
    .slice(0, 5)
    .map(([date, d]) => ({
      date,
      tMinC: Math.round(Math.min(...d.t) * 10) / 10,
      tMaxC: Math.round(Math.max(...d.t) * 10) / 10,
      shortwaveMjM2: null,
      rhMeanPct: mean(d.rh),
      windMeanMs: mean(d.w),
      precipMm: Math.round(d.p * 10) / 10,
      et0OpenMeteoMm: null,
    }));
  if (days.length === 0) throw new WeatherUnavailableError('MET: günlük veri çıkarılamadı');

  const first = series[0]!;
  const fd = (first['data'] ?? {}) as Json;
  const fdet = ((fd['instant'] as Json | undefined)?.['details'] ?? {}) as Json;
  const t0 = num(fdet['air_temperature']);
  const symbol = (
    ((fd['next_1_hours'] ?? fd['next_6_hours']) as Json | undefined)?.['summary'] as
      Json | undefined
  )?.['symbol_code'];
  return {
    source: METNO_SOURCE,
    version: 'Locationforecast 2.0 compact',
    sample: false,
    fetchedAt,
    stale: false,
    elevationM,
    utcOffsetSeconds: off,
    current:
      t0 === null
        ? null
        : {
            time: String(first['time']),
            tempC: t0,
            weatherCode: symbolToWmo(typeof symbol === 'string' ? symbol : null),
            apparentC: null,
            rhPct: num(fdet['relative_humidity']),
            windMs: num(fdet['wind_speed']),
            precipMm: num(
              ((fd['next_1_hours'] as Json | undefined)?.['details'] as Json | undefined)?.[
                'precipitation_amount'
              ],
            ),
          },
    days,
    ensemble: null,
  };
}

export class MetNorwayClient implements WeatherProvider {
  private readonly cache = new Map<string, { at: number; bundle: WeatherBundle }>();
  constructor(
    private readonly opts: {
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
      ttlMs?: number;
      now?: () => number;
    } = {},
  ) {}

  async get(lat: number, lon: number): Promise<WeatherBundle> {
    // MET şartı: koordinat en çok 4 ondalık; önbellek ~5 km ızgarada (Open-Meteo ile aynı).
    const now = (this.opts.now ?? Date.now)();
    const key = `${(Math.round(lat * 20) / 20).toFixed(2)},${(Math.round(lon * 20) / 20).toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && now - hit.at < (this.opts.ttlMs ?? 30 * 60_000)) return hit.bundle;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 8000);
    try {
      const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
      const res = await (this.opts.fetchImpl ?? fetch)(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new WeatherUnavailableError(`MET HTTP ${res.status}`);
      const bundle = parseMetno((await res.json()) as Json, lat, lon, new Date(now).toISOString());
      this.cache.set(key, { at: now, bundle });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value as string);
      return bundle;
    } catch (e) {
      if (hit) return { ...hit.bundle, stale: true };
      throw e instanceof WeatherUnavailableError ? e : new WeatherUnavailableError(String(e));
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Sırayla dener: ilk başarılı gerçek kaynak döner. Hepsi başarısızsa son hatayı (sebepleriyle) fırlatır.
 * Geçmiş veri (history) yalnız destekleyen kaynaklardan.
 */
export class ChainWeatherProvider implements WeatherProvider {
  constructor(private readonly providers: WeatherProvider[]) {}

  async get(lat: number, lon: number): Promise<WeatherBundle> {
    const errs: string[] = [];
    for (const p of this.providers) {
      try {
        return await p.get(lat, lon);
      } catch (e) {
        errs.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new WeatherUnavailableError(errs.join('; '));
  }

  async history(lat: number, lon: number, pastDays: number): Promise<WeatherBundle> {
    const errs: string[] = [];
    for (const p of this.providers) {
      if (!p.history) continue;
      try {
        return await p.history(lat, lon, pastDays);
      } catch (e) {
        errs.push(e instanceof Error ? e.message : String(e));
      }
    }
    throw new WeatherUnavailableError(errs.join('; ') || 'geçmiş yok');
  }
}
