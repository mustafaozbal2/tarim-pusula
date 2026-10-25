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

/**
 * `storedForEnv`: adres kaydedilirken uygulamanın derleme adresi. Yeni bir APK (farklı derleme adresi)
 * eskisinin üstüne kurulunca eski kayıtlı adres geçersiz sayılır; yoksa telefon eski bilgisayar
 * adresine bağlanmaya çalışıp her işte "internet yok" der (G23.1).
 */
export function resolveApiUrl(
  stored: string | null | undefined,
  env: string | undefined,
  storedForEnv?: string | null,
): string | null {
  const envUrl = normalizeApiUrl(env);
  const stale = envUrl !== null && normalizeApiUrl(storedForEnv) !== envUrl;
  return (stale ? null : normalizeApiUrl(stored)) ?? envUrl;
}
