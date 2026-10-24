/** Sunucu adresi çözümü: cihazda kayıtlı adres > EXPO_PUBLIC_API_URL. İkisi de yoksa `null` (çökme yok). */
export function normalizeApiUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function resolveApiUrl(
  stored: string | null | undefined,
  env: string | undefined,
): string | null {
  return normalizeApiUrl(stored) ?? normalizeApiUrl(env);
}
