import { EYLEMLER, niyetBul, type Eylem, type EylemKey } from './niyet';

/**
 * Asistanın "beyni": cümleden eylem. Varsayılan yereldir (niyet.ts, ağsız). EXPO_PUBLIC_NUVIA_URL
 * verilirse önce Nuvia'ya sorulur; Nuvia YALNIZ eylem anahtarı döndürebilir (serbest metin kabul
 * edilmez: değişmez kural 2, yapay zekâ tarım bilgisi/doz uydurmaz). Nuvia yoksa ya da yanıt
 * geçersizse yerel eşleyiciye düşülür.
 *
 * UYARI: Nuvia proje anahtarı telefona GÖMÜLEMEZ. EXPO_PUBLIC_NUVIA_URL yalnız kendi sunucumuzda
 * (anahtarı tutan) bir ara uca işaret edebilir; yerel eşleyici zaten yeterlidir.
 * Ara uç sözleşmesi: POST {url}/v1/tarim/niyet  {"metin": string, "eylemler": EylemKey[]}
 *                   → 200 {"eylem": EylemKey | null}
 */
export interface Beyin {
  anla(metin: string): Promise<Eylem | null>;
}

export const yerelBeyin: Beyin = { anla: async (m) => niyetBul(m) };

export function nuviaBeyni(url: string, fetchImpl: typeof fetch = fetch, ms = 2500): Beyin {
  return {
    async anla(metin) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), ms);
      try {
        const res = await fetchImpl(`${url.replace(/\/$/, '')}/v1/tarim/niyet`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ metin, eylemler: Object.keys(EYLEMLER) }),
          signal: ctl.signal,
        });
        if (res.ok) {
          const j = (await res.json()) as { eylem?: string | null };
          if (j.eylem && j.eylem in EYLEMLER) return EYLEMLER[j.eylem as EylemKey];
        }
      } catch {
        // Ağ yok ya da Nuvia kapalı: yerel eşleyici.
      } finally {
        clearTimeout(timer);
      }
      return niyetBul(metin);
    },
  };
}

export function varsayilanBeyin(): Beyin {
  const url = process.env['EXPO_PUBLIC_NUVIA_URL'];
  return url ? nuviaBeyni(url) : yerelBeyin;
}
