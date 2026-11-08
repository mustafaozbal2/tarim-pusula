import { describe, expect, it } from 'vitest';
import { apkKur, type ApkKurucu } from './apkKur';

const kurucu = (over: Partial<ApkKurucu> = {}) => {
  const adimlar: string[] = [];
  const k: ApkKurucu = {
    indir: async (a, ilerle) => {
      adimlar.push(`indir:${a}`);
      ilerle(0.5);
      ilerle(1);
      return 'file:///cache/x.apk';
    },
    icerikAdresi: async (d) => {
      adimlar.push(`icerik:${d}`);
      return 'content://x';
    },
    kurucuyuAc: async (c) => {
      adimlar.push(`ac:${c}`);
    },
    ...over,
  };
  return { k, adimlar };
};

describe('uygulama içi APK kurulumu', () => {
  it('indirir, içerik adresi alır, kurucuyu açar; ilerleme bildirilir', async () => {
    const { k, adimlar } = kurucu();
    const oranlar: number[] = [];
    expect(
      await apkKur('https://tarimpusula.onrender.com/tarim-pusula.apk', k, (o) => oranlar.push(o)),
    ).toBe('kurucu-acildi');
    expect(adimlar).toEqual([
      'indir:https://tarimpusula.onrender.com/tarim-pusula.apk',
      'icerik:file:///cache/x.apk',
      'ac:content://x',
    ]);
    expect(oranlar).toEqual([0.5, 1]);
  });
  it('https olmayan/apk olmayan adres ve her adım hatası "hata" döner (çağıran tarayıcıya düşer)', async () => {
    const { k } = kurucu();
    expect(await apkKur('http://x.com/a.apk', k)).toBe('hata');
    expect(await apkKur('https://x.com/a.html', k)).toBe('hata');
    const bozuk = kurucu({ indir: async () => Promise.reject(new Error('ağ')) });
    expect(await apkKur('https://x.com/a.apk', bozuk.k)).toBe('hata');
    const ac = kurucu({ kurucuyuAc: async () => Promise.reject(new Error('intent')) });
    expect(await apkKur('https://x.com/a.apk', ac.k)).toBe('hata');
  });
});
