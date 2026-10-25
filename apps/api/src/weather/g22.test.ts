import { describe, expect, it } from 'vitest';
import { demoWeather } from '../demo-server';
import {
  FakeWeatherProvider,
  FallbackWeatherProvider,
  OpenMeteoClient,
  parseBundle,
  sampleBundle,
  WeatherUnavailableError,
  type WeatherProvider,
} from './openmeteo';
import { buildToday } from './today';

// Open-Meteo `current` yanıtı (Open-Meteo belgesindeki alan adları; ağ yok).
const FORECAST = {
  utc_offset_seconds: 10800,
  elevation: 842,
  current: {
    time: '2026-10-25T14:00',
    temperature_2m: 18.4,
    apparent_temperature: 16.9,
    relative_humidity_2m: 47,
    wind_speed_10m: 3.2,
    precipitation: 0.2,
    weather_code: 3,
  },
  daily: {
    time: ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'],
    temperature_2m_max: [21, 20, 19, 22, 23],
    temperature_2m_min: [9, 8, 7, 10, 11],
    shortwave_radiation_sum: [14, 13, 12, 15, 15],
    relative_humidity_2m_mean: [55, 60, 62, 50, 48],
    wind_speed_10m_mean: [2, 2.5, 3, 1.5, 1],
    precipitation_sum: [0.2, 1.4, 0, 0, 0],
    et0_fao_evapotranspiration: [2.4, 2, 1.8, 2.6, 2.7],
  },
};

describe('G22 hava: şu an + 5 gün, kaynak + saat + sürüm', () => {
  it('şu an: sıcaklık, hissedilen, nem, rüzgâr, yağış ayrıştırılır', () => {
    const b = parseBundle(FORECAST, null, 'icon_seamless', '2026-10-25T11:05:00Z');
    expect(b.current).toEqual({
      time: '2026-10-25T14:00',
      tempC: 18.4,
      weatherCode: 3,
      apparentC: 16.9,
      rhPct: 47,
      windMs: 3.2,
      precipMm: 0.2,
    });
    expect(b.days).toHaveLength(5);
    expect(b.source).toContain('Open-Meteo');
    expect(b.source).toContain('CC BY 4.0');
    expect(b.version).toContain('v1');
    expect(b.sample).toBe(false);
  });

  it('istek şu an alanlarını ister (Open-Meteo current parametresi)', async () => {
    const urls: string[] = [];
    const client = new OpenMeteoClient({
      fetchImpl: (async (u: string) => {
        urls.push(u);
        return new Response(JSON.stringify(u.includes('ensemble') ? {} : FORECAST));
      }) as unknown as typeof fetch,
    });
    await client.get(37.1, 37.4);
    const f = urls.find((u) => u.includes('/v1/forecast'))!;
    const current = new URL(f).searchParams.get('current')!.split(',');
    for (const k of [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'precipitation',
    ]) {
      expect(current).toContain(k);
    }
  });

  it('gerçek sağlayıcı hata verirse örnek veriye düşer ve "Örnek veri" etiketi taşır', async () => {
    const broken: WeatherProvider = {
      get: async () => {
        throw new WeatherUnavailableError('ağ yok');
      },
    };
    const p = new FallbackWeatherProvider(broken, new FakeWeatherProvider());
    const b = await p.get(37, 37);
    expect(b.sample).toBe(true);
    expect(b.source).toContain('Örnek veri');
    expect(p.fallbacks).toBe(1);
  });

  it('gerçek sağlayıcı çalışıyorsa onun verisi döner (örnek etiketi yok)', async () => {
    const real = new FakeWeatherProvider(() => ({
      ...parseBundle(FORECAST, null, 'm', '2026-10-25T11:05:00Z'),
    }));
    const p = new FallbackWeatherProvider(real);
    const b = await p.get(37, 37);
    expect(b.sample).toBe(false);
    expect(p.fallbacks).toBe(0);
  });

  it('demo havası: varsayılan gerçek Open-Meteo (yedekli), DEMO_WEATHER=ornek ile örnek', () => {
    expect(demoWeather({})).toBeInstanceOf(FallbackWeatherProvider);
    expect(demoWeather({ DEMO_WEATHER: 'ornek' })).toBeInstanceOf(FakeWeatherProvider);
  });

  it('Bugün yanıtı sürüm ve örnek bilgisini taşır', () => {
    const r = buildToday({
      field: { id: 'f', name: 'T', lat: 37, lon: 37, cropId: null },
      bundle: sampleBundle(37, 37),
      pack: null,
      stages: [],
      now: new Date(),
    } as unknown as Parameters<typeof buildToday>[0]);
    expect(r.weather.sample).toBe(true);
    expect(r.weather.version).toBe('ornek-v1');
    expect(r.weather.days).toHaveLength(5);
    expect(r.weather.current?.apparentC).toBe(11);
  });
});
