import { describe, expect, it } from 'vitest';
import { bitisAni, sonTarih } from './sure';

const B = '2026-11-09';

describe('haber bitiş tarihi', () => {
  it('Bir Sürü Olsun: 04.11.2026 – 13.11.2026', () => {
    expect(sonTarih('Başvurular, 04.11.2026 – 13.11.2026 tarihleri arasında yapılacak.', B)).toBe(
      '2026-11-13',
    );
  });
  it('gün-ay aralığı, yılsız ve yıllı', () => {
    expect(sonTarih('Başvurular 4-13 Kasım tarihleri arasında', B)).toBe('2026-11-13');
    expect(sonTarih('28 Ekim - 13 Kasım 2026 arasında', B)).toBe('2026-11-13');
    expect(sonTarih('4 - 20 Aralık', B)).toBe('2026-12-20');
  });
  it('"tarihine kadar" ve "son başvuru"', () => {
    expect(sonTarih('Başvurular 20 Kasım tarihine kadar alınacaktır.', B)).toBe('2026-11-20');
    expect(sonTarih("Dilekçeler 25.11.2026'ya kadar verilmelidir.", B)).toBe('2026-11-25');
    expect(sonTarih('Son başvuru tarihi: 30 Kasım 2026', B)).toBe('2026-11-30');
  });
  it('yılsız ve 6 aydan çok geçmişte kalan tarih ertesi yıla gider; birden çok tarihte en geç olan', () => {
    expect(sonTarih('15 Ocak tarihine kadar', B)).toBe('2027-01-15');
    expect(sonTarih("25 Eylül'e kadar başvuru", B)).toBe('2026-09-25');
    expect(sonTarih('askı 18-19 Kasım; itiraz 20 Kasım tarihine kadar', B)).toBe('2026-11-20');
  });
  it('başvuru tarihi askı/itiraz/sonuç tarihlerinden önce gelir (Gaziantep Bir Sürü Olsun)', () => {
    const metin =
      'Başvurular, 04.11.2026 – 13.11.2026 tarihleri arasında işletmenin bulunduğu il/ilçe müdürlüğüne yapılır. Listelerin askıya çıkarılması ve itiraz: 18–19 Kasım 2026. Sonuçların açıklanması: 30 Kasım 2026.';
    expect(sonTarih(metin, B)).toBe('2026-11-13');
  });
  it('tarih yoksa null; bitiş anı gün sonu TSİ', () => {
    expect(sonTarih('Kadın çiftçiler yarışması yapıldı.', B)).toBeNull();
    expect(bitisAni('2026-11-13').toISOString()).toBe('2026-11-13T21:00:00.000Z');
  });
});
