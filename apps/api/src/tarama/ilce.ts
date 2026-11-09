import { foldTr } from '@tarim/agro-core';

/**
 * Haberin ilçesi: başlıkta (yoksa metinde) ilin ilçe adlarından biri geçiyorsa o ilçeye hedeflenir; böylece
 * ilçe yetkilisi kendi ilçesinin haberini görür ve yalnız onu düzenleyebilir. "Merkez" gibi genel adlar,
 * il adıyla aynı ilçe adları ve 3'ten çok ilçe sayan (il geneli) haberler il geneline kalır.
 */
const GENEL = new Set(['merkez']);

export function ilceleriBul(
  baslik: string,
  metin: string,
  il: string,
  ilceler: string[],
): string[] {
  const aday = ilceler.filter(
    (d) => !GENEL.has(foldTr(d)) && foldTr(d) !== foldTr(il) && d.length >= 3,
  );
  const bul = (s: string) => {
    const t = ` ${foldTr(s).replace(/[^a-z0-9 ]/g, ' ')} `;
    // Özel adın eki kesme işaretiyle ayrılır ("Nizip'te" → "nizip te"): tam kelime eşleşmesi yeter.
    return aday.filter((d) => t.includes(` ${foldTr(d).replace(/[^a-z0-9 ]/g, ' ')} `));
  };
  const b = bul(baslik);
  const sonuc = b.length > 0 ? b : bul(metin.slice(0, 1200));
  return sonuc.length >= 1 && sonuc.length <= 3 ? sonuc : [];
}
