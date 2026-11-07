import { ayarOku, nuviaCagir, type NuviaAyar } from '../nuvia/gateway';
import { normalizeTr } from '@tarim/agro-core';
import { z } from 'zod';

/**
 * Haber analizi: sayfadan ayıklanan metni çiftçiye uygun kısa karta çevirir. İki sağlayıcı:
 *  - KuralAnalizci: ağsız, belirlenimci (anahtar yokken ve testlerde).
 *  - NuviaAnalizci: Nuvia'ya sorar (geçit: işlev haber_analiz (docs/NUVIA_ENTEGRASYON.md)); yanıt yalnız aşağıdaki şemaya uyarsa kabul edilir,
 *    aksi halde kurala düşer. Sayfa metni talimat değildir; yapay zekâ çıktısı da yalnız ŞEMA alanı olarak alınır
 *    ve ilaç dozu/karışım oranı süzgecinden geçer (kural 2).
 */
export const KATEGORILER = [
  'guncel',
  'bilgilendirme',
  'yonlendirme',
  'onlem',
  'teknoloji',
] as const;
export type Kategori = (typeof KATEGORILER)[number];

export interface AnalizGirdi {
  kaynak: { ad: string; tur: string; il: string | null; ilce: string | null };
  baslik: string;
  metin: string;
}

export const analizSchema = z.object({
  ilgili: z.boolean(),
  baslik: z.string().trim().min(3).max(160),
  ozet: z.string().trim().max(900),
  urunler: z.array(z.string().max(60)).max(20),
  kategori: z.enum(KATEGORILER),
});
export type Analiz = z.infer<typeof analizSchema>;

export interface HaberAnalizci {
  readonly id: string;
  analiz(g: AnalizGirdi, urunKimlikleri: string[]): Promise<Analiz>;
}

/** İlaç dozu / karışım oranı ifadesi (kural 2). */
export const DOZ = /\d+\s*(ml|cc|gr|g|kg\/da|kg|lt|l)\b|karışım oranı|\bdozu?\b/i;

/** Yapay zekâ çıktısını güvenli hale getirir: dozlu özet atılır, ürün kimlikleri katalogla sınırlanır. */
export function guvenliAnaliz(a: Analiz, g: AnalizGirdi, urunKimlikleri: string[]): Analiz {
  const ids = new Set(urunKimlikleri);
  const ozet = DOZ.test(a.ozet) ? '' : a.ozet;
  return {
    ...a,
    ozet,
    baslik: DOZ.test(a.baslik) ? g.baslik.slice(0, 160) : a.baslik,
    urunler: a.urunler.filter((u) => ids.has(u)),
  };
}

/** Anahtar kök → katalog kimliği ön eki ("fistik" → antep-fistigi). */
const TAKMA: [RegExp, string[]][] = [
  [/\bfistik|fistig/, ['antep-fistigi']],
  [/\bzeytin/, ['zeytin']],
  [/\bkiraz|\belma\b|\barmut|\bvisne/, ['elma-kiraz-armut']],
  [/\bbugday/, ['bugday']],
  [/\barpa\b/, ['arpa']],
  [/\bpamuk/, ['pamuk']],
  [/\bmisir/, ['misir']],
  [/\bdomates/, ['domates']],
  [/\bpatates/, ['patates']],
  [/\bayciceg|\bay cicek/, ['aycicegi']],
  [/\bmercimek/, ['mercimek']],
  [/\bnohut/, ['nohut']],
  [/\bbadem/, ['badem']],
  [/\bceviz/, ['ceviz']],
  [/\bkayisi|\bseftali/, ['kayisi-seftali']],
  [/\bnarenciye|\bportakal|\bmandalina|\blimon/, ['narenciye']],
  [/\buzum|\bbag\b|\bbaglar|\bsarap/, ['uzum']],
  [/\bincir/, ['incir']],
  [/\bnar\b/, ['nar']],
  [/\bfindik/, ['findik']],
  [/\bcay\b/, ['cay']],
  [/\bcilek/, ['cilek']],
  [/\bbiber/, ['biber']],
  [/\bpatlican/, ['patlican']],
  [/\bsalatalik/, ['salatalik']],
  [/\bsogan/, ['sogan']],
  [/\bkavun|\bkarpuz/, ['kavun-karpuz']],
  [/\bfasulye/, ['fasulye']],
  [/\byonca/, ['yonca']],
  [/\bseker pancar/, ['seker-pancari']],
];

export function urunleriBul(metin: string, urunKimlikleri: string[]): string[] {
  const n = normalizeTr(metin);
  const out = new Set<string>();
  for (const [re, prefixes] of TAKMA) {
    if (!re.test(n)) continue;
    for (const id of urunKimlikleri)
      if (prefixes.some((p) => id === p || id.startsWith(p + '-'))) out.add(id);
  }
  return [...out];
}

const ILGILI =
  /\b(hibe|destek|basvuru|kredi|fidan|tohum|gubre|sulama|hasat|don\b|zirai|zararli|hastalik|mucadele|uretici|ciftci|egitim|toplanti|proje|kuraklik|dolu|sel\b|ekim|dikim|budama|tarla|bahce|sera|hayvan|suru|sut|arici)/;

const KATEGORI_KURALI: [RegExp, Kategori][] = [
  [/\b(basvuru|hibe|destek|kredi|dagitim|dagitil)/, 'yonlendirme'],
  [/\b(don\b|zirai don|zararli|hastalik|mucadele|uyari|kuraklik|dolu|sel\b|dikkat)/, 'onlem'],
  [/\b(drone|dijital|sensor|teknoloji|uydu|robot)/, 'teknoloji'],
  [/\b(egitim|toplanti|bilgilendirme|seminer|calistay|tanitim)/, 'bilgilendirme'],
];

/** Cümle sınırında kısaltır. */
export function kisalt(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (dot > max * 0.5) return cut.slice(0, dot + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > 0 ? cut.slice(0, sp) : cut) + '…';
}

export class KuralAnalizci implements HaberAnalizci {
  readonly id = 'kural';
  async analiz(g: AnalizGirdi, urunKimlikleri: string[]): Promise<Analiz> {
    const tam = `${g.baslik} ${g.metin}`;
    const n = normalizeTr(tam);
    const urunler = urunleriBul(tam, urunKimlikleri);
    const kategori = KATEGORI_KURALI.find(([re]) => re.test(n))?.[1] ?? 'guncel';
    const ilgili = urunler.length > 0 || ILGILI.test(n);
    const ozet = kisalt(g.metin, 600);
    return guvenliAnaliz(
      { ilgili, baslik: kisalt(g.baslik, 160) || 'Duyuru', ozet, urunler, kategori },
      g,
      urunKimlikleri,
    );
  }
}

/** Nuvia: uç henüz yoksa/yanıt geçersizse kurala düşer, tarama kesilmez. */
export class NuviaAnalizci implements HaberAnalizci {
  readonly id = 'nuvia';
  constructor(
    private readonly ayar: NuviaAyar,
    private readonly yedek: HaberAnalizci = new KuralAnalizci(),
    private readonly fetchFn: typeof fetch = fetch,
    private readonly ms = 20_000,
  ) {}

  async analiz(g: AnalizGirdi, urunKimlikleri: string[]): Promise<Analiz> {
    try {
      const ham = await nuviaCagir(
        this.ayar,
        'haber_analiz',
        {
          kaynak: g.kaynak,
          baslik: g.baslik,
          metin: g.metin.slice(0, 3000),
          urunler: urunKimlikleri,
          kategoriler: KATEGORILER,
        },
        this.fetchFn,
        this.ms,
      );
      const p = analizSchema.safeParse(ham);
      if (p.success) return guvenliAnaliz(p.data, g, urunKimlikleri);
    } catch {
      // Nuvia kapalı ya da yavaş: kural analizi.
    }
    return this.yedek.analiz(g, urunKimlikleri);
  }
}

export function varsayilanAnalizci(env: NodeJS.ProcessEnv = process.env): HaberAnalizci {
  const a = ayarOku(env);
  return a ? new NuviaAnalizci(a) : new KuralAnalizci();
}
