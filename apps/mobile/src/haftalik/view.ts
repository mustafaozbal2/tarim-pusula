/** Haftalık özet ekranının metin yardımcıları. */

/** "2026-11-28" -> "28.11.2026" */
export function gunTr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Bugünden kaç gün sonra: "bugün", "yarın", "5 gün sonra". */
export function kalanGun(tarih: string, bugun: string): string {
  const n = Math.round((Date.parse(tarih) - Date.parse(bugun)) / 86_400_000);
  return n <= 0 ? 'bugün' : n === 1 ? 'yarın' : `${n} gün sonra`;
}

/** Fiyat değişimi: "%4,2 arttı" / "%3 düştü" / "değişmedi". */
export function fiyatDegisimi(pct: number): { metin: string; yon: 'artis' | 'dusus' | 'sabit' } {
  if (pct === 0) return { metin: 'değişmedi', yon: 'sabit' };
  const y = Math.abs(pct).toLocaleString('tr-TR');
  return pct > 0 ? { metin: `%${y} arttı`, yon: 'artis' } : { metin: `%${y} düştü`, yon: 'dusus' };
}

export const UYARI_ADI = {
  don: 'Don',
  kar: 'Kar',
  ruzgar: 'Kuvvetli rüzgâr',
  yagis: 'Kuvvetli yağış',
} as const;
