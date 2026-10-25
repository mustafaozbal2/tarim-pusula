/** Yüzde metnini hacimsel nem oranına (0-1) çevirir; boş/geçersiz: null (otomatik eşik). */
export function parseThresholdPercent(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  if (!text.trim() || !Number.isFinite(n) || n <= 0 || n >= 100) return null;
  return n / 100;
}

/** Saat kutusu: 0-23 tam sayı, aksi halde önceki değer. */
export function hourOf(text: string, fallback: number): number {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}
