import { describe, expect, it } from 'vitest';
import { gecmisUyarilar, haftaAnahtari, haftalikFiyat, ozetAraligi, sonGunYakin } from './haftalik';

describe('haftaAnahtari (ISO 8601)', () => {
  it('bilinen tarihler', () => {
    expect(haftaAnahtari('2026-11-23')).toBe('2026-W48'); // pazartesi
    expect(haftaAnahtari('2026-11-29')).toBe('2026-W48'); // pazar, aynı hafta
    expect(haftaAnahtari('2026-11-30')).toBe('2026-W49');
    // Yıl sınırı: 1 Ocak 2027 cuma, önceki yılın 53. haftası; 29 Aralık 2025 pazartesi 2026-W01.
    expect(haftaAnahtari('2027-01-01')).toBe('2026-W53');
    expect(haftaAnahtari('2025-12-29')).toBe('2026-W01');
  });
});

describe('gecmisUyarilar', () => {
  it('kopyaları ve uyarı olmayan kayıtları ayıklar', () => {
    const u = gecmisUyarilar([
      'frost:t1:2026-11-20',
      'hava-don:t1:2026-11-20', // aynı don, ikinci kaynak
      'sms:hava-don:t1:2026-11-20', // kanal kopyası
      'toplu:abc123',
      'ozet:2026-11-19',
      'hava-yagis:t2:2026-11-18',
      'hava-ruzgar:t1:2026-11-21',
    ]);
    expect(u).toEqual([
      { tur: 'yagis', fieldId: 't2', tarih: '2026-11-18' },
      { tur: 'don', fieldId: 't1', tarih: '2026-11-20' },
      { tur: 'ruzgar', fieldId: 't1', tarih: '2026-11-21' },
    ]);
  });
});

describe('haftalikFiyat', () => {
  it('son gün ile 7 gün önceki günü karşılaştırır, aynı günü ortalar', () => {
    const f = haftalikFiyat([
      { date: '2026-11-23', price: 11 },
      { date: '2026-11-23', price: 13 }, // ort 12
      { date: '2026-11-20', price: 9 }, // 3 gün: aralık dışı
      { date: '2026-11-16', price: 10 }, // tam 7 gün
      { date: '2026-11-15', price: 50 }, // 8 gün: 7'ye daha uzak
    ]);
    expect(f).toEqual({
      son: 12,
      sonTarih: '2026-11-23',
      onceki: 10,
      oncekiTarih: '2026-11-16',
      degisimPct: 20,
    });
  });

  it('karşılaştırılacak gün yoksa null (seyrek seri)', () => {
    expect(
      haftalikFiyat([
        { date: '2026-11-23', price: 10 },
        { date: '2026-11-01', price: 8 },
      ]),
    ).toBeNull();
    expect(haftalikFiyat([])).toBeNull();
  });

  it('düşüş eksi yüzde verir', () => {
    expect(
      haftalikFiyat([
        { date: '2026-11-23', price: 9 },
        { date: '2026-11-17', price: 12 },
      ])?.degisimPct,
    ).toBe(-25);
  });
});

describe('ozetAraligi', () => {
  it('7 gün geri, 14 gün ileri', () => {
    expect(ozetAraligi('2026-11-24')).toEqual({ gecenBas: '2026-11-17', ileriSon: '2026-12-08' });
  });
});

describe('sonGunYakin', () => {
  it('bugün ile 3 gün sonrası arası yakın; geçmiş, uzak ve bilinmeyen değil', () => {
    expect(sonGunYakin('2026-11-24', '2026-11-24')).toBe(true);
    expect(sonGunYakin('2026-11-27', '2026-11-24')).toBe(true);
    expect(sonGunYakin('2026-11-28', '2026-11-24')).toBe(false);
    expect(sonGunYakin('2026-11-23', '2026-11-24')).toBe(false);
    expect(sonGunYakin(null, '2026-11-24')).toBe(false);
    // ay ve yıl geçişi
    expect(sonGunYakin('2027-01-02', '2026-12-30')).toBe(true);
  });
});
