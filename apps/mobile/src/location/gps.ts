export type GpsResult =
  | { ok: true; lat: number; lon: number; accuracyM: number | null }
  | { ok: false; reason: 'izin-yok' | 'alinamadi' };

/** Konum sağlayıcısı arayüzü (expo-location üstüne ince katman; testte sahtesi kullanılır). */
export interface LocationProvider {
  requestPermission(): Promise<'granted' | 'denied'>;
  currentPosition(): Promise<{ lat: number; lon: number; accuracyM: number | null }>;
}

/**
 * Tarladayım: izin iste, konumu al. İzin verilmezse ya da alınamazsa `ok: false` döner;
 * ekran bu durumda otomatik olarak köy listesine düşer.
 */
export async function locateOnce(p: LocationProvider): Promise<GpsResult> {
  let perm: 'granted' | 'denied';
  try {
    perm = await p.requestPermission();
  } catch {
    return { ok: false, reason: 'izin-yok' };
  }
  if (perm !== 'granted') return { ok: false, reason: 'izin-yok' };
  try {
    const pos = await p.currentPosition();
    if (!Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) throw new Error('geçersiz');
    return { ok: true, ...pos };
  } catch {
    return { ok: false, reason: 'alinamadi' };
  }
}
