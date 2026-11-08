import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { haberGorselAdi, haberGorselNotu } from './haberGorseli';

const ad = (title: string, category: string | null = null) =>
  haberGorselAdi({ title, body: '', category });

describe('haber görseli kütüphanesi', () => {
  it('konuya uygun görsel seçer', () => {
    expect(ad('Büyükbaş hayvan yetiştiricilerine şap aşısı')).toBe('haber_inek.jpg');
    expect(ad('Küçükbaş hayvan yetiştiricisi destek')).toBe('haber_koyun.jpg');
    expect(ad('Antep fıstığı hasadı başladı')).toBe('haber_fistik.jpg');
    expect(ad('Zeytinde zeytin sineği ile mücadele')).toBe('haber_zeytin.jpg');
    expect(ad('Arıcılara kovan desteği')).toBe('haber_ari.jpg');
    expect(ad('Buğday ve arpa ekimi')).toBe('haber_bugday.jpg');
    expect(ad('Zirai don uyarısı')).toBe('haber_don.jpg');
    expect(ad('Tarlada robotlar ve sensörler')).toBe('kart_3.jpg'); // profesyonel tarla dronu; oyuncak robot görseli değil
    expect(ad('Damla sulama sistemleri hibesi')).toBe('haber_sulama.jpg');
  });
  it('özel konu genel konudan önce gelir; eşleşme yoksa kategoriye göre genel görsel', () => {
    expect(ad('Fıstık üreticilerine hibe başvuruları')).toBe('haber_fistik.jpg');
    expect(ad('Duyuru', 'onlem')).toBe('haber_don.jpg');
    expect(ad('Genel duyuru')).toBe('genis_tarla.jpg');
  });
  it('seçilen her görsel pakette vardır; kütüphane görseli atıf notu taşır', () => {
    for (const t of ['inek', 'fistik', 'don', 'kiraz', 'zeytin']) {
      const n = `haber_${t}.jpg` as const;
      expect(existsSync(join(__dirname, '../../assets/haber', `${t}.jpg`))).toBe(true);
      expect(haberGorselNotu(n)).toMatch(/Wikimedia Commons/);
    }
    expect(haberGorselNotu('kart_1.jpg')).toBeNull();
  });
});
