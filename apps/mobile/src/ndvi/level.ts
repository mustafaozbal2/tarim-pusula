/**
 * NDVI'yi çiftçi diline çevirir (G23.17). Genel kabul gören aralıklar: ~0,2 altı çıplak toprak ya da çok
 * zayıf bitki, 0,2-0,4 seyrek, 0,4-0,6 orta, 0,6 üstü gür yeşil bitki örtüsü. Bu yalnız BİLGİDİR; uyarı ya
 * da komut üretmez (düşüş kuralı uzman onaylı değil, kural 1).
 */
export type NdviLevel = { key: 'ciplak' | 'seyrek' | 'orta' | 'gur'; text: string; color: string };

export function ndviLevel(value: number): NdviLevel {
  if (value < 0.2)
    return { key: 'ciplak', text: 'Çok az yeşil (toprak görünüyor)', color: '#B9842A' };
  if (value < 0.4) return { key: 'seyrek', text: 'Seyrek yeşil', color: '#D4A72C' };
  if (value < 0.6) return { key: 'orta', text: 'Orta yeşil', color: '#7DB043' };
  return { key: 'gur', text: 'Gür yeşil', color: '#2F8F3E' };
}
