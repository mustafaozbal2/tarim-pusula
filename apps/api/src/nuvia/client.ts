import { containsDose } from '@tarim/agro-core';
import { z } from 'zod';
import { ayarOku, nuviaCagir, type NuviaAyar } from './gateway';

/**
 * Nuvia istemcisi: uzmanın cevaplamadığı soruya yapay zekâ cevabı. Sözleşme docs/NUVIA_ENTEGRASYON.md.
 * Cevap yalnız şemaya uyarsa alınır; ilaç dozu/karışım oranı içeriyorsa ATILIR (kural 2); sonuna yapay zekâ
 * uyarısı eklenir. Nuvia yoksa/yanıt geçersizse null döner ve soru uzmanda beklemeye devam eder.
 */
export interface NuviaSoru {
  soru: string;
  il?: string | null;
  ilce?: string | null;
  urun?: string | null;
  /** Fotoğraflı soru: base64 (jpeg/png/webp). */
  gorsel?: { mime: string; base64: string } | null;
}

export interface NuviaCevap {
  metin: string;
  kaynak: string;
}

export const UYARI =
  'Bu cevabı Nuvia yapay zekâsı hazırladı; hata içerebilir ve uzman cevabı değildir. Tüm risk size aittir. İlaç ve gübre miktarı için ziraat mühendisine ve ilaç etiketine danışın.';

export interface NuviaClient {
  readonly id: string;
  soruCevapla(s: NuviaSoru): Promise<NuviaCevap | null>;
}

const yanit = z.object({
  cevap: z.string().trim().min(10).max(1800),
  adimlar: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  kaynaklar: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
});

export class HttpNuviaClient implements NuviaClient {
  readonly id = 'nuvia';
  constructor(
    private readonly ayar: NuviaAyar,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly ms = 60_000,
  ) {}

  async soruCevapla(s: NuviaSoru): Promise<NuviaCevap | null> {
    try {
      // Geçit yalnız metin alır: fotoğraf ham gitmez; Nuvia'ya "fotoğraflı soru" notu iletilir.
      const ham = await nuviaCagir(
        this.ayar,
        'soru_cevapla',
        { ...s, gorsel: s.gorsel ? 'var (metin geçidinde iletilmedi)' : null },
        this.fetchFn,
        this.ms,
      );
      if (ham === null) return null;
      const p = yanit.safeParse(ham);
      if (!p.success) return null;
      const govde = [p.data.cevap, ...(p.data.adimlar ?? []).map((a, i) => `${i + 1}. ${a}`)].join(
        '\n',
      );
      if (containsDose(govde)) return null;
      return {
        metin: `${govde}\n\n${UYARI}`.slice(0, 2500),
        kaynak:
          `Nuvia (yapay zekâ)${p.data.kaynaklar?.length ? `; dayanak: ${p.data.kaynaklar.join(', ')}` : ''}`.slice(
            0,
            300,
          ),
      };
    } catch {
      return null;
    }
  }
}

/** Nuvia yapılandırılmamışsa hiçbir şey yapmaz: soru uzmanda bekler. */
export class KapaliNuvia implements NuviaClient {
  readonly id = 'kapali';
  async soruCevapla(): Promise<null> {
    return null;
  }
}

export function varsayilanNuvia(env: NodeJS.ProcessEnv = process.env): NuviaClient {
  const a = ayarOku(env);
  return a ? new HttpNuviaClient(a) : new KapaliNuvia();
}
