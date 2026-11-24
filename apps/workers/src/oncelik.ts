import { createHash } from 'node:crypto';
import type { NotificationJob } from './queue';
import type { NotificationKind } from './quietHours';

/**
 * Bildirim önemi. Günlük sayı sınırı yoktur (5-10 tarlalı çiftçi her uyarıyı alır); sınır yerine sıra vardır:
 * kritik (don, kuvvetli yağış/sel, dolu, ilaçlama son günü) her saatte ve ayrıca SMS/WhatsApp ile gider,
 * önemli hemen gider (sessiz saatte sabaha kalır), bilgi akşam günlük özete katlanır.
 */
export type Oncelik = 'kritik' | 'onemli' | 'bilgi';
export const ONCELIK_SIRASI: Record<Oncelik, number> = { kritik: 0, onemli: 1, bilgi: 2 };

/** Taramanın bulduğu tek olay (bir tarla, bir tehlike). */
export interface Uyari {
  oncelik: Oncelik;
  userId: string;
  kind: NotificationKind;
  /** Tek başına giderse bildirim başlığı ve metni. */
  baslik: string;
  metin: string;
  /** Toplu bildirimde ve SMS'te kullanılan kısa satır: "Ev tarlası 01:00-06:00 -2°". */
  satir: string;
  dedupeKey: string;
  data?: Record<string, unknown>;
}

/** Toplu bildirimde en çok bu kadar satır yazılır; kalanı "ve N uyarı daha" olur. */
export const TOPLU_SATIR = 5;

const sirala = (a: Uyari, b: Uyari) =>
  ONCELIK_SIRASI[a.oncelik] - ONCELIK_SIRASI[b.oncelik] || a.dedupeKey.localeCompare(b.dedupeKey);

/** Başlığa göre gruplanmış satırlar: "Bu gece don bekleniyor: A 01-06 -2°, B 03-07 -1°". */
export function gruplaSatir(uyarilar: Uyari[], azami = TOPLU_SATIR): string[] {
  const gruplar = new Map<string, string[]>();
  for (const u of uyarilar) gruplar.set(u.baslik, [...(gruplar.get(u.baslik) ?? []), u.satir]);
  const satirlar = [...gruplar].map(([b, s]) => `${b}: ${s.join(', ')}`);
  const fazla = satirlar.length - azami;
  return fazla > 0 ? [...satirlar.slice(0, azami), `ve ${fazla} uyarı daha`] : satirlar;
}

function topla(u: Uyari[], baslik: string, kind: NotificationKind, oncelik: Oncelik) {
  const anahtarlar = u.map((x) => x.dedupeKey);
  return {
    kind,
    oncelik,
    userId: u[0]!.userId,
    title: baslik,
    body: gruplaSatir(u).join('\n'),
    dedupeKey: `toplu:${createHash('sha1').update(anahtarlar.join('|')).digest('hex').slice(0, 16)}`,
    anahtarlar,
    data: { toplu: anahtarlar.length },
  } satisfies NotificationJob;
}

/**
 * Bir taramanın uyarılarını kullanıcı başına bildirim işlerine çevirir, önem sırasıyla:
 * aynı önemde tek uyarı kendi metniyle, birden fazlası tek bildirimde toplanır.
 * Bilgi düzeyi yalnız `ozetZamani` iken tek "Günlük özet" olarak gider (o gün başına bir kez).
 */
export function paketle(
  uyarilar: Uyari[],
  opts: { ozetZamani: boolean; gun: string },
): NotificationJob[] {
  const kisi = new Map<string, Uyari[]>();
  for (const u of [...uyarilar].sort(sirala))
    kisi.set(u.userId, [...(kisi.get(u.userId) ?? []), u]);
  const isler: NotificationJob[] = [];
  for (const liste of kisi.values()) {
    for (const oncelik of ['kritik', 'onemli'] as const) {
      const u = liste.filter((x) => x.oncelik === oncelik);
      if (u.length === 1) {
        const [x] = u as [Uyari];
        isler.push({
          kind: x.kind,
          oncelik,
          userId: x.userId,
          title: x.baslik,
          body: x.metin,
          dedupeKey: x.dedupeKey,
          data: x.data,
        });
      } else if (u.length > 1) {
        const ad = oncelik === 'kritik' ? 'acil uyarı' : 'önemli uyarı';
        // Kritik toplu bildirim don içeriyorsa sessiz saatte de gitsin diye tür 'frost'.
        const kind = u.some((x) => x.kind === 'frost') ? 'frost' : u[0]!.kind;
        isler.push(topla(u, `${u.length} ${ad}`, kind, oncelik));
      }
    }
    const bilgi = liste.filter((x) => x.oncelik === 'bilgi');
    if (opts.ozetZamani && bilgi.length) {
      isler.push({
        ...topla(bilgi, 'Günlük özet', 'info', 'bilgi'),
        dedupeKey: `ozet:${opts.gun}`,
      });
    }
  }
  return isler;
}
