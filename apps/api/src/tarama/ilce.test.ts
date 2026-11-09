import { describe, expect, it } from 'vitest';
import { ilceleriBul } from './ilce';

const GAZ = [
  'Araban',
  'İslahiye',
  'Karkamış',
  'Nizip',
  'Nurdağı',
  'Oğuzeli',
  'Şahinbey',
  'Şehitkamil',
  'Yavuzeli',
];

describe('haberin ilçesi', () => {
  it('başlıktaki ilçe (ekli halleriyle) bulunur', () => {
    expect(ilceleriBul("Şehitkamil'de fıstık hasadı", '', 'Gaziantep', GAZ)).toEqual([
      'Şehitkamil',
    ]);
    expect(ilceleriBul('Nizip ve Oğuzeli çiftçilerine eğitim', '', 'Gaziantep', GAZ)).toEqual([
      'Nizip',
      'Oğuzeli',
    ]);
  });
  it('başlıkta yoksa metinden; il geneli (çok ilçe) ve ilçesiz haber boş döner', () => {
    expect(
      ilceleriBul('Fidan dağıtımı', "Dağıtım Islahiye'de yapılacak", 'Gaziantep', GAZ),
    ).toEqual(['İslahiye']);
    expect(
      ilceleriBul('Bir Sürü Olsun Projesi', 'Başvurular il müdürlüğüne yapılır.', 'Gaziantep', GAZ),
    ).toEqual([]);
    expect(
      ilceleriBul('Araban, Nizip, Nurdağı ve Yavuzeli ilçelerinde', '', 'Gaziantep', GAZ),
    ).toEqual([]);
  });
  it('başka kelimenin içinde geçen ilçe adı eşleşmez', () => {
    expect(ilceleriBul('Arabanın bakımı', '', 'Gaziantep', ['Arab'])).toEqual([]);
  });
});
