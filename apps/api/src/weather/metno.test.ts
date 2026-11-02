import { describe, expect, it } from 'vitest';
import {
  ChainWeatherProvider,
  MetNorwayClient,
  parseMetno,
  symbolToWmo,
  utcOffsetFor,
} from './metno';
import {
  FallbackWeatherProvider,
  FakeWeatherProvider,
  WeatherUnavailableError,
  type WeatherProvider,
} from './openmeteo';

const entry = (time: string, t: number, p1?: number, p6?: number, sym = 'partlycloudy_day') => ({
  time,
  data: {
    instant: { details: { air_temperature: t, relative_humidity: 60, wind_speed: 2 } },
    ...(p1 !== undefined
      ? { next_1_hours: { summary: { symbol_code: sym }, details: { precipitation_amount: p1 } } }
      : {}),
    ...(p6 !== undefined
      ? { next_6_hours: { summary: { symbol_code: sym }, details: { precipitation_amount: p6 } } }
      : {}),
  },
});

const FIX = {
  geometry: { coordinates: [37.38, 37.06, 864] },
  properties: {
    timeseries: [
      entry('2026-11-02T09:00:00Z', 15, 0, 0.5, 'lightrain'),
      entry('2026-11-02T12:00:00Z', 18, 0.4),
      entry('2026-11-02T20:00:00Z', 9, 0.2),
      // 21:00Z = yerel 00:00 (UTC+3): ertesi gün
      entry('2026-11-02T21:00:00Z', 8, undefined, 3),
      entry('2026-11-03T03:00:00Z', 6, undefined, 1),
      entry('2026-11-03T09:00:00Z', 16, undefined, 0),
    ],
  },
};

describe('MET Norway (ikinci gerçek hava kaynağı)', () => {
  it('sembol kodu WMO koduna (ekran ve efektler aynı ölçekte)', () => {
    expect(symbolToWmo('clearsky_day')).toBe(0);
    expect(symbolToWmo('fair_night')).toBe(1);
    expect(symbolToWmo('partlycloudy_day')).toBe(2);
    expect(symbolToWmo('cloudy')).toBe(3);
    expect(symbolToWmo('fog')).toBe(45);
    expect(symbolToWmo('lightrain')).toBe(61);
    expect(symbolToWmo('heavyrainshowers_day')).toBe(82);
    expect(symbolToWmo('snow')).toBe(73);
    expect(symbolToWmo('rainandthunder')).toBe(95);
  });

  it('Türkiye UTC+3, dışı boylamdan', () => {
    expect(utcOffsetFor(37.06, 37.38)).toBe(10800);
    expect(utcOffsetFor(59.9, 10.7)).toBe(3600);
  });

  it('saatlikten yerel güne: en düşük/en yüksek, yağış (1 saatlik varsa o, yoksa 6 saatlik; çift sayılmaz)', () => {
    const b = parseMetno(FIX, 37.06, 37.38, '2026-11-02T09:00:00Z');
    expect(b.sample).toBe(false);
    expect(b.ensemble).toBeNull(); // don olasılığı uydurulmaz
    expect(b.elevationM).toBe(864);
    expect(b.utcOffsetSeconds).toBe(10800);
    expect(b.days).toHaveLength(2);
    expect(b.days[0]).toMatchObject({ date: '2026-11-02', tMinC: 9, tMaxC: 18, precipMm: 0.6 });
    expect(b.days[1]).toMatchObject({ date: '2026-11-03', tMinC: 6, tMaxC: 16, precipMm: 4 });
    expect(b.current).toMatchObject({ tempC: 15, weatherCode: 61, rhPct: 60, windMs: 2 });
  });

  it('istemci: User-Agent gönderir, önbellekler; hata sebebi görünür', async () => {
    const calls: RequestInit[] = [];
    const ok = (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify(FIX), { status: 200 });
    }) as unknown as typeof fetch;
    const c = new MetNorwayClient({ fetchImpl: ok, now: () => 0 });
    await c.get(37.06, 37.38);
    await c.get(37.07, 37.39); // aynı ~5 km ızgara: önbellekten
    expect(calls).toHaveLength(1);
    expect((calls[0]!.headers as Record<string, string>)['user-agent']).toMatch(/TarimPusula/);
    const bad = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
    await expect(new MetNorwayClient({ fetchImpl: bad }).get(1, 1)).rejects.toThrow(/MET HTTP 403/);
  });

  it('zincir: Open-Meteo 429 verirse MET Norway gerçek verisi; ikisi de düşerse örnek veri ve sebepler', async () => {
    const om429: WeatherProvider = {
      get: async () => {
        throw new WeatherUnavailableError('HTTP 429');
      },
    };
    const met: WeatherProvider = { get: async (la, lo) => parseMetno(FIX, la, lo, 'x') };
    const b = await new FallbackWeatherProvider(new ChainWeatherProvider([om429, met])).get(
      37.06,
      37.38,
    );
    expect(b.sample).toBe(false);
    expect(b.source).toContain('MET Norway');

    const metDown: WeatherProvider = {
      get: async () => {
        throw new WeatherUnavailableError('MET HTTP 503');
      },
    };
    const s = await new FallbackWeatherProvider(
      new ChainWeatherProvider([om429, metDown]),
      new FakeWeatherProvider(),
    ).get(37, 37);
    expect(s.sample).toBe(true);
    expect(s.source).toContain('429');
    expect(s.source).toContain('503');
  });
});
