/**
 * Nuvia çağrı katmanı. Sözleşme: NUVIA_API.md / docs/NUVIA_ENTEGRASYON.md.
 *  POST {NUVIA_ADRES}/v1/proje/sor, başlık x-nuvia-proje: tarim_pusula.nvp_..., gövde {islev, girdi}
 *  yanıt {ok, veri|metin}. Anahtar yalnız sunucuda durur. NUVIA_SAHTE=1 ya da anahtar yoksa ağa çıkılmaz:
 *  çağıranlar yedeğe düşer (haber: kural analizi; soru: uzmanda bekler).
 * Hatalar: 429/502 için en çok 1 kez yeniden denenir; 45 sn zaman aşımı.
 */
export interface NuviaAyar {
  url: string;
  /** "tarim_pusula.nvp_..." ya da yalnız "nvp_..." (proje adı eklenir). */
  projeAnahtari: string;
}

export const PROJE_ADI = 'tarim_pusula';

export function ayarOku(env: NodeJS.ProcessEnv = process.env): NuviaAyar | null {
  const url = env['NUVIA_ADRES'] || env['NUVIA_URL'];
  const anahtar = env['NUVIA_PROJE_ANAHTARI'];
  if (!url || !anahtar || env['NUVIA_SAHTE'] === '1') return null;
  return { url, projeAnahtari: anahtar };
}

export async function nuviaCagir(
  a: NuviaAyar,
  islev: string,
  girdi: Record<string, unknown>,
  fetchFn: typeof fetch,
  ms = 45_000,
  bekle: (ms: number) => Promise<void> = (t) => new Promise((r) => setTimeout(r, t)),
): Promise<unknown | null> {
  const baslik = a.projeAnahtari.includes('.')
    ? a.projeAnahtari
    : `${PROJE_ADI}.${a.projeAnahtari}`;
  for (let deneme = 0; deneme < 2; deneme++) {
    try {
      const res = await fetchFn(`${a.url.replace(/\/$/, '')}/v1/proje/sor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nuvia-proje': baslik },
        body: JSON.stringify({ islev, girdi: JSON.stringify(girdi) }),
        signal: AbortSignal.timeout(ms),
      });
      if (res.status === 429 || res.status === 502) {
        if (deneme === 0) await bekle(1500);
        continue;
      }
      if (!res.ok) return null;
      const j = (await res.json()) as { ok?: boolean; veri?: unknown };
      return j.ok && j.veri !== undefined ? j.veri : null;
    } catch {
      /* ağ hatası: bir kez daha dene */
    }
  }
  return null;
}
