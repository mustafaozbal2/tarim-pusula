import { containsDose } from '@tarim/agro-core';
import { z } from 'zod';
import { ayarOku, nuviaCagir, nuviaSes, type NuviaAyar } from './gateway';

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
  /** Fotoğraf teşhisi: modelin güveni (0-100). Model vermediyse null (bilinmiyor = emin değil sayılır). */
  guven?: number | null;
  /** Fotoğraf teşhisi: olası sebepler, en çok 3. */
  olasilar?: string[];
}

/** Model güveni 0-1 ya da 0-100 gelebilir; 0-100 tam sayıya çevrilir. */
export function guvenYuzde(g: number | undefined): number | null {
  if (g === undefined || !Number.isFinite(g) || g < 0 || g > 100) return null;
  return Math.round(g <= 1 ? g * 100 : g);
}

export const UYARI =
  'Bu cevabı Nuvia yapay zekâsı hazırladı; hata içerebilir ve uzman cevabı değildir. Tüm risk size aittir. İlaç ve gübre miktarı için ziraat mühendisine ve ilaç etiketine danışın.';

export interface RobotSoru {
  soru: string;
  urun?: string | null;
  il?: string | null;
  /** Son birkaç mesaj ("Çiftçi: ...", "Robot: ..."), en çok 6. */
  gecmis?: string[];
}

export interface RobotCevap {
  cevap: string;
  yonlendir: 'bugun' | 'takvim' | 'sulama' | 'uzmana-sor' | 'haberler' | 'ayarlar' | null;
}

export interface NuviaClient {
  readonly id: string;
  soruCevapla(s: NuviaSoru): Promise<NuviaCevap | null>;
  /** Robot asistanın serbest sohbeti (sesli okunur). Nuvia yoksa null. */
  robotSohbet?(s: RobotSoru): Promise<RobotCevap | null>;
  /** Kadın sesi (WAV, base64). Nuvia yoksa null: telefon kendi sesini kullanır. */
  ses?(metin: string): Promise<{ mime: string; ses_b64: string } | null>;
}

const yanit = z.object({
  cevap: z.string().trim().min(10).max(1800),
  adimlar: z.array(z.string().trim().min(1).max(300)).max(6).optional(),
  kaynaklar: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
  guven: z.number().optional(),
  olasi_nedenler: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
});

/** foto_analiz isteğine eklenen not: güven ve olası sebepler ayrı alanlarda istenir. */
const FOTO_ISTEK =
  'Cevaba ek olarak "guven" (0-100, teşhisten ne kadar eminsin) ve "olasi_nedenler" (en olasıdan başlayarak en çok 3 kısa sebep) alanlarını doldur. Emin değilsen düşük güven ver.';

const robotYanit = z.object({
  cevap: z.string().trim().min(2).max(700),
  yonlendir: z
    .enum(['bugun', 'takvim', 'sulama', 'uzmana-sor', 'haberler', 'ayarlar', 'yok'])
    .optional(),
});

export class HttpNuviaClient implements NuviaClient {
  readonly id = 'nuvia';
  constructor(
    private readonly ayar: NuviaAyar,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly ms = 60_000,
  ) {}

  async robotSohbet(s: RobotSoru): Promise<RobotCevap | null> {
    try {
      const ham = await nuviaCagir(
        this.ayar,
        'robot_sohbet',
        {
          ...s,
          soru: s.soru.slice(0, 600),
          gecmis: (s.gecmis ?? []).slice(-6).map((x) => x.slice(0, 300)),
        },
        this.fetchFn,
        this.ms,
      );
      const p = robotYanit.safeParse(ham);
      if (!p.success || containsDose(p.data.cevap)) return null;
      const y = p.data.yonlendir;
      return { cevap: p.data.cevap, yonlendir: y && y !== 'yok' ? y : null };
    } catch {
      return null;
    }
  }

  async ses(metin: string): Promise<{ mime: string; ses_b64: string } | null> {
    return nuviaSes(this.ayar, metin, this.fetchFn);
  }

  async soruCevapla(s: NuviaSoru): Promise<NuviaCevap | null> {
    try {
      // Fotoğraf varsa `foto_analiz` (görüntü Nuvia'ya gerçekten gider); çökerse metin işlevine düşülür.
      const { gorsel, ...metinli } = s;
      let ham: unknown | null = null;
      if (gorsel?.base64) {
        ham = await nuviaCagir(
          this.ayar,
          'foto_analiz',
          { ...metinli, istek: FOTO_ISTEK },
          this.fetchFn,
          this.ms,
          {
            gorsel: { mime: gorsel.mime, base64: gorsel.base64 },
          },
        );
      }
      if (ham === null) {
        ham = await nuviaCagir(
          this.ayar,
          'soru_cevapla',
          { ...metinli, gorsel: gorsel ? 'var (görüntü işlenemedi)' : null },
          this.fetchFn,
          this.ms,
        );
      }
      if (ham === null) return null;
      const p = yanit.safeParse(ham);
      if (!p.success) return null;
      const govde = [p.data.cevap, ...(p.data.adimlar ?? []).map((a, i) => `${i + 1}. ${a}`)].join(
        '\n',
      );
      const olasilar = (p.data.olasi_nedenler ?? []).slice(0, 3);
      if (containsDose(govde) || olasilar.some(containsDose)) return null;
      return {
        ...(gorsel ? { guven: guvenYuzde(p.data.guven), olasilar } : {}),
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
