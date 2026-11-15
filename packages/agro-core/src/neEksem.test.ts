import { describe, expect, it } from 'vitest';
import {
  fuseEstimates,
  gapBand,
  gapBar,
  gapRatio,
  quotaDecare,
  rankCandidates,
  rankingHitRate,
  remainingQuota,
  stratifiedAreaEstimate,
  treeCohortProjection,
  type CropCandidate,
} from './neEksem';

describe('Olofsson vd. (2014) Bölüm 5 örneği', () => {
  // Harita payları ve Tablo 8 örnek sayıları (Alloc2: 75, 75, 165, 325; toplam 640).
  const W = [0.02, 0.015, 0.32, 0.645];
  const counts = [
    [66, 0, 5, 4],
    [0, 55, 8, 12],
    [1, 0, 153, 11],
    [2, 1, 9, 313],
  ];
  it('ormansızlaşma alanı 235.086 piksel, hata payı ±68.418 (makaledeki değerler)', () => {
    const r = stratifiedAreaEstimate(W, counts, 10_000_000);
    const d = r.classes[0]!;
    expect(d.mappedArea).toBe(200_000);
    expect(Math.round(d.area)).toBe(235_086);
    // Makale: SH(p̂_·1) ≈ 0,0035 → 1,96·SH·A = 68.418 piksel.
    expect(Math.round(d.standardError)).toBe(34_907);
    expect(Math.round(d.marginOfError)).toBe(68_418);
    // Kullanıcı doğruluğu 66/75 = 0,88
    expect(d.usersAccuracy).toBeCloseTo(0.88, 6);
    expect(r.overallAccuracy).toBeGreaterThan(0.9);
    // Alanlar toplamı toplam alana eşit (p̂_·k toplamı 1).
    expect(r.classes.reduce((s, c) => s + c.area, 0)).toBeCloseTo(10_000_000, 3);
  });
  it('geçersiz girdi hata verir', () => {
    expect(() => stratifiedAreaEstimate([0.5, 0.4], counts, 1)).toThrow();
    expect(() =>
      stratifiedAreaEstimate(
        [0.5, 0.5],
        [
          [1, 0],
          [0, 1],
        ],
        1,
      ),
    ).toThrow();
  });
});

describe('ters varyans birleştirme', () => {
  it('eşit belirsizlikte ortalama; küçük σ ağır basar', () => {
    expect(fuseEstimates({ value: 100, sigma: 10 }, { value: 120, sigma: 10 }).value).toBe(110);
    const f = fuseEstimates({ value: 100, sigma: 5 }, { value: 120, sigma: 20 });
    expect(f.weightA).toBeCloseTo(16 / 17, 9);
    expect(f.value).toBeCloseTo(100 + 20 / 17, 9);
    expect(f.sigma).toBeLessThan(5);
  });
});

describe('yaş-kohort modeli', () => {
  it('fidanlar 3. yıldan sonra ürüne girer; üretim yıllar içinde artar', () => {
    const p = treeCohortProjection({
      treesByAge: [100, 0, 0, 0, 0],
      yieldByAge: [0, 0, 0, 5, 10, 20],
      newPlanting: 0,
      years: 6,
    });
    expect(p.map((x) => x.productionKg)).toEqual([0, 0, 0, 500, 1000, 2000, 2000]);
  });
  it('söküm üretimi azaltır; yeni dikim gecikmeli eklenir', () => {
    const p = treeCohortProjection({
      treesByAge: [0, 0, 0, 100],
      yieldByAge: [0, 0, 0, 10],
      newPlanting: 50,
      removalRate: 0.1,
      years: 4,
    });
    expect(p[0]!.productionKg).toBe(1000);
    expect(p[1]!.productionKg).toBeCloseTo(900);
    // 4. yıl: ilk dikim (t=0'da 50) 3 yaşına gelmez (yaş 4'te v=10 uygulanır: dizinin son değeri), kontrol:
    expect(p[4]!.productionKg).toBeGreaterThan(p[3]!.productionKg - 1);
  });
});

describe('denge', () => {
  it('açık oranı ve bantlar', () => {
    expect(gapRatio(63.2)).toBeCloseTo(0.368);
    expect(gapRatio(104.5)).toBeCloseTo(-0.045);
    expect(gapBand(0.368)).toBe('acik-buyuk');
    expect(gapBand(0.154)).toBe('acik'); // arpa 84,6
    expect(gapBand(-0.045)).toBe('dengede'); // Antep fıstığı
    expect(gapBand(-0.175)).toBe('fazla'); // nohut 117,5
    expect(gapBand(-4.949)).toBe('cok-fazla'); // kayısı 594,9
  });
  it('çubuk: dengede 0,5; büyük açık 1; büyük fazla 0', () => {
    expect(gapBar(0)).toBe(0.5);
    expect(gapBar(0.3)).toBe(1);
    expect(gapBar(0.5)).toBe(1);
    expect(gapBar(-0.5)).toBe(0);
    expect(gapBar(-0.25)).toBeCloseTo(0.25);
  });
});

const cand = (over: Partial<CropCandidate>): CropCandidate => ({
  cropId: 'x',
  name: 'X',
  lifespan: 'yillik',
  yeterlilikPct: 100,
  balanceSource: { period: '2024-2025', source: 'TÜİK', date: '2026-03-27' },
  inDistrictPlan: false,
  inProvincePlan: false,
  restricted: null,
  suitability: null,
  priceTrend: null,
  ...over,
});

describe('sıralama', () => {
  it('açık ve resmî plan birlikte sıralar; planlı ilçe ürünü öne geçer; kısıtlı ve verisiz ayrı listede', () => {
    const r = rankCandidates([
      cand({ cropId: 'aycicegi', name: 'Ayçiçeği', yeterlilikPct: 63.2 }),
      cand({ cropId: 'arpa', name: 'Arpa', yeterlilikPct: 84.6 }),
      cand({ cropId: 'misir', name: 'Mısır', yeterlilikPct: 73.1, inDistrictPlan: true }),
      cand({ cropId: 'nohut', name: 'Nohut', yeterlilikPct: 117.5, inDistrictPlan: true }),
      cand({ cropId: 'bugday-a', name: 'Buğday A', yeterlilikPct: 104.3, inDistrictPlan: true }),
      cand({ cropId: 'bugday-b', name: 'Buğday B', yeterlilikPct: 104.3 }),
      cand({
        cropId: 'kayisi',
        name: 'Kayısı',
        yeterlilikPct: 594.9,
        lifespan: 'cok-yillik',
        restricted: {
          rule: 'yeterlilik ≥ %150',
          source: 'Yönetmelik',
          reviewStatus: 'taslak-uzman-onayi-bekliyor',
        },
      }),
      cand({ cropId: 'zeytin', name: 'Zeytin', yeterlilikPct: null, balanceSource: null }),
    ]);
    // Mısır: açık 0,269 + ilçe planı 0,15 = 0,419 > Ayçiçeği 0,368 (plansız).
    expect(r.ranked.map((x) => x.cropId)).toEqual([
      'misir',
      'aycicegi',
      'arpa',
      'bugday-a',
      'nohut', // fazla ama planlı: -0,175+0,15 = -0,025
      'bugday-b', // dengede, plansız: -0,043
    ]);
    expect(r.restricted.map((x) => x.cropId)).toEqual(['kayisi']);
    expect(r.noData.map((x) => x.cropId)).toEqual(['zeytin']);
    expect(r.ranked[1]!.band).toBe('acik-buyuk');
    expect(r.ranked[1]!.reasons[0]).toContain('%63,2');
    expect(r.ranked[0]!.reasons.some((s) => s.includes('havza ürün deseni'))).toBe(true);
    expect(r.ranked[0]!.confidence).toBe('temel');
  });
  it('uygun değil olan sıralamaya girmez; fiyat eğilimi puanı sınırlı', () => {
    const r = rankCandidates([
      cand({ cropId: 'a', yeterlilikPct: 80, suitability: 'uygun-degil' }),
      cand({ cropId: 'b', yeterlilikPct: 80, priceTrend: 3 }),
      cand({ cropId: 'c', yeterlilikPct: 80, priceTrend: 0.5 }),
    ]);
    expect(r.ranked.map((x) => x.cropId)).toEqual(['b', 'c']);
    expect(r.ranked[0]!.score).toBeCloseTo(r.ranked[1]!.score, 9); // ikisi de 0,5'e kırpıldı
  });
  it('uydu/yerinde doğrulama güven düzeyini yükseltir', () => {
    const r = rankCandidates([
      cand({ cropId: 'a', satellite: true }),
      cand({ cropId: 'b', satellite: true, locallyVerified: true }),
    ]);
    expect(r.ranked.find((x) => x.cropId === 'a')!.confidence).toBe('uydu-destekli');
    expect(r.ranked.find((x) => x.cropId === 'b')!.confidence).toBe('yerinde-dogrulanmis');
  });
});

describe('kota ve niyet', () => {
  it('kota = açık ton / verim; beyanlar düşer; talep yoksa null', () => {
    // Talep 1000 ton, yeterlilik %80 → açık 200 ton; verim 400 kg/da → 500 dekar.
    expect(quotaDecare(1000, 80, 400)).toBeCloseTo(500, 6);
    expect(remainingQuota(500, { cropId: 'x', decare: 120, count: 3 })).toBe(380);
    expect(remainingQuota(500, undefined)).toBe(500);
    expect(quotaDecare(null, 80, 400)).toBeNull();
    expect(quotaDecare(1000, 120, 400)).toBe(0);
  });
});

describe('sıralama isabeti', () => {
  it('medyan üstü fiyat artışı isabet sayılır', () => {
    const r = rankingHitRate(['a', 'b', 'c'], { a: 0.3, b: -0.1, c: 0.2, d: 0.0, e: -0.2 });
    expect(r.hits).toEqual(['a', 'c']);
    expect(r.misses).toEqual(['b']);
    expect(r.hitRate).toBeCloseTo(2 / 3);
    expect(rankingHitRate([], {}).hitRate).toBe(0);
  });
});
