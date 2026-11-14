import { describe, expect, it } from 'vitest';
import type { TwinDto, TwinScenarioDto } from '../api/client';
import {
  doluluk,
  durumKarti,
  grafikSerisi,
  karneMetni,
  kisaTarih,
  oneriCumlesi,
  senaryoOzeti,
  sikintiGunu,
  suDurumu,
} from './model';

const q = (p50: number, pm = 0) => ({ p10: p50 - pm, p50, p90: p50 + pm });
const senaryo = (over: Partial<TwinScenarioDto> = {}): TwinScenarioDto => ({
  plan: { kind: 'kural' },
  label: 'Pusula kuralıyla sularsam',
  days: [
    { date: '2026-07-10', dr: q(30), stressFraction: 0, irrigationMm: 0 },
    { date: '2026-07-11', dr: q(40), stressFraction: 0.2, irrigationMm: 0 },
    { date: '2026-07-12', dr: q(10), stressFraction: 0.6, irrigationMm: 45 },
  ],
  waterMm: q(45),
  irrigations: 1,
  stressDays: q(0),
  minKs: 1,
  deepPercolationMm: 0,
  etaOverEtx: q(1),
  members: 5,
  yieldLoss: {
    fraction: q(0),
    model: { kind: 'ky', ky: 1, basis: 'varsayim', source: 'x' },
    caveat: '',
  },
  ...over,
});
const dto = (over: Partial<TwinDto> = {}): TwinDto => ({
  fieldId: 'f',
  fieldName: 'Tarla',
  cropId: 'zeytin',
  generatedAt: '',
  today: '2026-07-10',
  mode: 'oneri',
  badge: false,
  unapproved: [],
  params: {
    kc: 0.7,
    thetaFc: 0.25,
    thetaWp: 0.11,
    rootDepthM: 1.45,
    pTable: 0.65,
    soilKey: 'tinli',
  },
  state: {
    days: [
      {
        date: '2026-07-08',
        drStart: 20,
        drEnd: 25,
        taw: 200,
        raw: 130,
        ks: 1,
        etc: 5,
        etcAdj: 5,
        rainMm: 0,
        irrigationMm: 0,
        deepPercolationMm: 0,
        sigmaMm: 10,
        corrected: null,
        stress: false,
      },
      {
        date: '2026-07-09',
        drStart: 25,
        drEnd: 30,
        taw: 200,
        raw: 130,
        ks: 1,
        etc: 5,
        etcAdj: 5,
        rainMm: 3,
        irrigationMm: 20,
        deepPercolationMm: 0,
        sigmaMm: 12,
        corrected: null,
        stress: false,
      },
    ],
    end: { date: '2026-07-09', dr: 30, sigmaMm: 12, taw: 200, raw: 130 },
    assumptions: [],
  },
  scenarios: [senaryo()],
  ruleFirstIrrigation: { date: '2026-07-12', mm: 45 },
  gdd: null,
  events: [],
  observations: 0,
  scorecard: { count: 0, maeMm: 0, coverage: 0, biasMm: 0 },
  weather: { source: '', version: '', sample: false, stale: false, fetchedAt: '' },
  sources: { kc: null, soil: null, waterParams: '', yield: '', method: '' },
  assumptions: [],
  ...over,
});

describe('ikiz model', () => {
  it('tarih ve doluluk', () => {
    expect(kisaTarih('2026-07-12')).toBe('12 Tem');
    expect(doluluk(50, 200)).toBe(0.75);
    expect(doluluk(250, 200)).toBe(0);
  });
  it('su durumu eşikleri', () => {
    expect(suDurumu(30, 130)).toBe('rahat');
    expect(suDurumu(120, 130)).toBe('sinirda');
    expect(suDurumu(131, 130)).toBe('sikintida');
  });
  it('sıkıntı günü: üyelerin yarısından çoğu stresli ilk gün', () => {
    expect(sikintiGunu(senaryo())).toEqual({ date: '2026-07-12', gun: 2 });
    expect(sikintiGunu(senaryo({ days: [] }))).toBeNull();
  });
  it('senaryo özeti: su hacmi dekara göre, verim riski aralığı', () => {
    const o = senaryoOzeti(
      senaryo({
        yieldLoss: {
          fraction: q(0.1, 0.05),
          model: { kind: 'ky', ky: 1, basis: 'kaynak', source: '' },
          caveat: '',
        },
      }),
      10,
    );
    expect(o.su).toBe('Su: 45 mm (≈ 450 m³), 1 sulama');
    expect(o.verim).toBe('Verim kaybı riski %5–%15');
    expect(o.sikinti).toBe('2 gün sonra su sıkıntısı (12 Tem)');
    expect(o.tone).toBe('orta');
    expect(senaryoOzeti(senaryo(), null).su).toBe('Su: 45 mm, 1 sulama');
  });
  it('grafik serisi: geçmiş + tahmin, p10/p90 ters eşlenir', () => {
    const g = grafikSerisi(dto(), senaryo());
    expect(g).toHaveLength(5);
    expect(g[1]).toMatchObject({ gecmis: true, sulama: true, yagis: true, p50: 0.85 });
    expect(g[2]!.gecmis).toBe(false);
    expect(g[2]!.p10).toBeLessThanOrEqual(g[2]!.p90);
  });
  it('durum kartı ve öneri cümlesi (öneri / bilgi kipi)', () => {
    const d = durumKarti(dto());
    expect(d.baslik).toBe('Bitki suyunu rahat alıyor');
    expect(d.altBaslik).toBe('Kökteki su %85 dolu · eksik 30 mm (sınır 130 mm)');
    expect(oneriCumlesi(dto())).toBe('2 gün sonra (12 Tem) yaklaşık 45 mm sulama öneriliyor.');
    expect(oneriCumlesi(dto({ mode: 'bilgi' }))).toContain('bilgi; öneri değil');
    expect(oneriCumlesi(dto({ ruleFirstIrrigation: null }))).toContain('gerekmiyor');
  });
  it('karne metni', () => {
    expect(karneMetni({ count: 0, maeMm: 0, coverage: 0, biasMm: 0 })).toContain('Henüz');
    expect(karneMetni({ count: 12, maeMm: 4.26, coverage: 0.75, biasMm: 1 })).toBe(
      '12 tahmin doğrulandı · ortalama hata 4.3 mm · %75 aralık içinde',
    );
  });
});
