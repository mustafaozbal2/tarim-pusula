/**
 * Tanıtım hedefleri: ekrandaki bir düğmeyi/kutuyu tanıtım turunun gösterebilmesi için kaydeder.
 * Kullanım: `<Pressable ref={hedefRef('ana.menu')} ...>`. Aynı kimlik birden çok ekranda (yığında alttaki sayfa)
 * bulunabilir; en son bağlanan (en üstteki sayfa) ölçülür.
 */
export interface Dikdortgen {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Olculebilir {
  measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
}

const dugumler = new Map<string, Olculebilir[]>();
const onbellek = new Map<string, (dugum: unknown) => (() => void) | void>();

/** Kimliğe bağlı, yeniden çizimlerde değişmeyen ref işlevi (React 19: dönen işlev sökülürken çağrılır). */
export function hedefRef(kimlik: string): (dugum: unknown) => (() => void) | void {
  let f = onbellek.get(kimlik);
  if (!f) {
    f = (dugum: unknown) => {
      if (!dugum) return;
      const d = dugum as Olculebilir;
      const liste = dugumler.get(kimlik) ?? [];
      liste.push(d);
      dugumler.set(kimlik, liste);
      return () => {
        const l = dugumler.get(kimlik);
        if (!l) return;
        const i = l.lastIndexOf(d);
        if (i >= 0) l.splice(i, 1);
        if (l.length === 0) dugumler.delete(kimlik);
      };
    };
    onbellek.set(kimlik, f);
  }
  return f;
}

export function hedefVar(kimlik: string): boolean {
  return (dugumler.get(kimlik)?.length ?? 0) > 0;
}

/** Hedefin pencere içindeki yeri; ekranda değilse/ölçülemezse null. */
export function hedefOlc(kimlik: string, zamanAsimiMs = 400): Promise<Dikdortgen | null> {
  const d = dugumler.get(kimlik)?.at(-1);
  if (!d?.measureInWindow) return Promise.resolve(null);
  return new Promise((coz) => {
    let bitti = false;
    const t = setTimeout(() => {
      if (!bitti) {
        bitti = true;
        coz(null);
      }
    }, zamanAsimiMs);
    try {
      d.measureInWindow!((x, y, w, h) => {
        if (bitti) return;
        bitti = true;
        clearTimeout(t);
        coz(
          [x, y, w, h].every((v) => Number.isFinite(v)) && w > 0 && h > 0 ? { x, y, w, h } : null,
        );
      });
    } catch {
      if (!bitti) {
        bitti = true;
        clearTimeout(t);
        coz(null);
      }
    }
  });
}

/** Odaktaki sayfanın kaydırıcısı: hedef ekran dışındaysa tur onu görünür yere kaydırır. */
export interface Kaydirici {
  kaydir(y: number): void;
  konum(): number;
}

const kaydiricilar: Kaydirici[] = [];

export function kaydiriciEkle(k: Kaydirici): () => void {
  kaydiricilar.push(k);
  return () => {
    const i = kaydiricilar.lastIndexOf(k);
    if (i >= 0) kaydiricilar.splice(i, 1);
  };
}

export function etkinKaydirici(): Kaydirici | null {
  return kaydiricilar.at(-1) ?? null;
}

/**
 * Hedef görünür alanın dışındaysa kaydırma miktarı (piksel; artı = aşağı). Görünürse 0.
 * `ust`/`alt`: sabit bantların (durum çubuğu, alt gezinme) kapladığı pay.
 */
export function kaydirmaFarki(
  r: Dikdortgen,
  ekranYuksekligi: number,
  ust: number,
  alt: number,
): number {
  const gorunurUst = ust + 8;
  const gorunurAlt = ekranYuksekligi - alt - 8;
  if (r.y >= gorunurUst && r.y + r.h <= gorunurAlt) return 0;
  // Hedefi görünür alanın üst üçte birine getir (altında açıklama kutusuna yer kalsın).
  const istenen = gorunurUst + (gorunurAlt - gorunurUst) * 0.28;
  return Math.round(r.y - istenen);
}
