/**
 * Kullanıcıya özel haftalık özetin saf hesapları: geçen haftanın uyarıları (gönderim kaydından),
 * hal fiyatının haftalık değişimi ve hafta anahtarı (haftalık bildirim bir kez gitsin diye).
 */

const MS_DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_DAY;
const isoOf = (n: number) => new Date(n * MS_DAY).toISOString().slice(0, 10);

/** ISO 8601 hafta anahtarı: "2026-W48". Hafta pazartesi başlar; yılın ilk perşembesini içeren hafta 1'dir. */
export function haftaAnahtari(today: string): string {
  const n = dayNum(today);
  const gun = (new Date(n * MS_DAY).getUTCDay() + 6) % 7; // pazartesi 0
  const persembe = n - gun + 3;
  const yil = new Date(persembe * MS_DAY).getUTCFullYear();
  const hafta = Math.floor((persembe - dayNum(`${yil}-01-01`)) / 7) + 1;
  return `${yil}-W${String(hafta).padStart(2, '0')}`;
}

export type UyariTuru = 'don' | 'kar' | 'ruzgar' | 'yagis';

export interface GecmisUyari {
  tur: UyariTuru;
  fieldId: string;
  /** Uyarının ilgili olduğu gün (YYYY-MM-DD). */
  tarih: string;
}

/**
 * Gönderim kaydı anahtarlarından ("frost:<tarla>:<gün>", "hava-<tür>:<tarla>:<gün>") tekil uyarılar.
 * Toplu bildirim, günlük özet ve SMS/WhatsApp kanal kayıtları aynı olayın kopyasıdır, sayılmaz.
 * Aynı tarla ve günün iki kaynaktan gelen don uyarısı (frost ve hava-don) tek sayılır.
 */
export function gecmisUyarilar(anahtarlar: readonly string[]): GecmisUyari[] {
  const tekil = new Map<string, GecmisUyari>();
  for (const k of anahtarlar) {
    const m = /^(frost|hava-(don|kar|ruzgar|yagis)):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (!m) continue;
    const tur = (m[2] ?? 'don') as UyariTuru;
    const u = { tur, fieldId: m[3]!, tarih: m[4]! };
    tekil.set(`${u.tur}|${u.fieldId}|${u.tarih}`, u);
  }
  return [...tekil.values()].sort(
    (a, b) => a.tarih.localeCompare(b.tarih) || a.tur.localeCompare(b.tur),
  );
}

export interface FiyatNoktasi {
  date: string;
  price: number;
}

export interface HaftalikFiyat {
  son: number;
  sonTarih: string;
  onceki: number;
  oncekiTarih: string;
  /** (son - önceki) / önceki × 100, bir ondalık. */
  degisimPct: number;
}

/**
 * Bir hal serisinde son günün fiyatı ile ondan 7 gün önceye en yakın günün fiyatı (5-10 gün arası kabul;
 * eşit uzaklıkta eski gün). Aynı günün birden çok kaydı ortalanır. Uygun önceki gün yoksa null:
 * seyrek seride uydurma karşılaştırma yapılmaz.
 */
export function haftalikFiyat(seri: readonly FiyatNoktasi[]): HaftalikFiyat | null {
  const gunler = new Map<string, number[]>();
  for (const p of seri)
    if (Number.isFinite(p.price) && p.price > 0)
      gunler.set(p.date, [...(gunler.get(p.date) ?? []), p.price]);
  if (!gunler.size) return null;
  const ort = (d: string) => {
    const v = gunler.get(d)!;
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const sonTarih = [...gunler.keys()].sort().at(-1)!;
  const hedef = dayNum(sonTarih) - 7;
  let oncekiTarih: string | null = null;
  for (const d of [...gunler.keys()].sort()) {
    const fark = dayNum(sonTarih) - dayNum(d);
    if (fark < 5 || fark > 10) continue;
    if (oncekiTarih === null || Math.abs(dayNum(d) - hedef) < Math.abs(dayNum(oncekiTarih) - hedef))
      oncekiTarih = d;
  }
  if (!oncekiTarih) return null;
  const son = ort(sonTarih);
  const onceki = ort(oncekiTarih);
  return {
    son,
    sonTarih,
    onceki,
    oncekiTarih,
    degisimPct: Math.round(((son - onceki) / onceki) * 1000) / 10,
  };
}

/** Son günü kaçırılmasın diye öne çıkarılan başvurular için eşik (gün). */
export const YAKIN_SON_GUN = 3;

/** Başvuru son günü bugün ile `esik` gün sonrası arasındaysa true; geçmiş ya da bilinmeyen son gün false. */
export function sonGunYakin(sonGun: string | null, bugun: string, esik = YAKIN_SON_GUN): boolean {
  if (!sonGun) return false;
  const n = dayNum(sonGun) - dayNum(bugun);
  return n >= 0 && n <= esik;
}

/** Özetin kapsadığı aralık: bugünden geriye 7 gün (geçen hafta) ve ileriye 14 gün (yaklaşan tarihler). */
export function ozetAraligi(today: string): { gecenBas: string; ileriSon: string } {
  return { gecenBas: isoOf(dayNum(today) - 7), ileriSon: isoOf(dayNum(today) + 14) };
}
