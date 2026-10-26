/** "12,5" ya da "12.5" -> 12.5; boş -> null; geçersiz -> undefined. */
export function parseArea(raw: string): number | null | undefined {
  const v = raw.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : undefined;
}
