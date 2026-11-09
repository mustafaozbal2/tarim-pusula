/**
 * Haberin son geçerlilik günü (başvuru bitişi): metindeki tarih aralığı ya da "… tarihine kadar" ifadesi.
 * Bulunursa haber o günün sonunda yayından kalkar; bulunamazsa VARSAYILAN_GUN sonra kalkar.
 * Yıl yazılmamışsa haberin alındığı yıl; o tarih 6 aydan çok geçmişte kalıyorsa ertesi yıl sayılır.
 */
export const VARSAYILAN_GUN = 45;

const AYLAR: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

const sade = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return null;
  return t.toISOString().slice(0, 10);
};

function yilBul(m: number, d: number, yazili: string | undefined, bugun: string): number {
  if (yazili) return Number(yazili);
  const y = Number(bugun.slice(0, 4));
  const aday = iso(y, m, d);
  return aday && Date.parse(aday) < Date.parse(bugun) - 183 * 86_400_000 ? y + 1 : y;
}

/** Metindeki bitiş tarihi (YYYY-MM-DD) ya da null. `bugun` YYYY-MM-DD. */
export function sonTarih(metin: string, bugun: string): string | null {
  const s = sade(metin);
  const adaylar: { t: string; i: number }[] = [];
  const AY = '(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)';
  // 04.11.2026 - 13.11.2026  |  4.11 - 13.11.2026
  for (const m of s.matchAll(
    /(\d{1,2})[./](\d{1,2})(?:[./](20\d{2}))?\s*-\s*(\d{1,2})[./](\d{1,2})[./](20\d{2})/g,
  )) {
    const t = iso(Number(m[6]), Number(m[5]), Number(m[4]));
    if (t) adaylar.push({ t, i: m.index ?? 0 });
  }
  // 4-13 kasim 2026 | 4 - 13 kasim | 4 kasim - 13 kasim 2026 | 28 ekim - 13 kasim
  for (const m of s.matchAll(
    new RegExp(`(\\d{1,2})(?:\\s+${AY})?\\s*-\\s*(\\d{1,2})\\s+${AY}(?:\\s+(20\\d{2}))?`, 'g'),
  )) {
    const ay = AYLAR[m[4]!]!;
    const g = Number(m[3]);
    const t = iso(yilBul(ay, g, m[5], bugun), ay, g);
    if (t) adaylar.push({ t, i: m.index ?? 0 });
  }
  // … 13 kasim 2026 tarihine kadar | 13.11.2026'ya kadar | son basvuru tarihi 13 kasim
  for (const m of s.matchAll(
    new RegExp(
      `(\\d{1,2})\\s+${AY}(?:\\s+(20\\d{2}))?(?:\\s+(?:tarihine|gunune|gunu))?\\s*('?\\w{0,3})?\\s*kadar`,
      'g',
    ),
  )) {
    const ay = AYLAR[m[2]!]!;
    const g = Number(m[1]);
    const t = iso(yilBul(ay, g, m[3], bugun), ay, g);
    if (t) adaylar.push({ t, i: m.index ?? 0 });
  }
  for (const m of s.matchAll(
    /(\d{1,2})[./](\d{1,2})[./](20\d{2})(?:\s+(?:tarihine|gunune))?\s*('?\w{0,3})?\s*kadar/g,
  )) {
    const t = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (t) adaylar.push({ t, i: m.index ?? 0 });
  }
  for (const m of s.matchAll(
    new RegExp(
      `son (?:basvuru|gun|tarih)[a-z ]{0,20}:?\\s*(\\d{1,2})\\s+${AY}(?:\\s+(20\\d{2}))?`,
      'g',
    ),
  )) {
    const ay = AYLAR[m[2]!]!;
    const g = Number(m[1]);
    const t = iso(yilBul(ay, g, m[3], bugun), ay, g);
    if (t) adaylar.push({ t, i: m.index ?? 0 });
  }
  if (adaylar.length === 0) return null;
  // "Başvuru" sözcüğünden hemen sonra gelen tarih başvuru bitişidir (askı/itiraz/sonuç tarihleri değil).
  const basvuru = adaylar.filter((a) => /basvuru/.test(s.slice(Math.max(0, a.i - 90), a.i + 10)));
  const secilen = basvuru.length ? basvuru : adaylar;
  return secilen
    .map((a) => a.t)
    .sort()
    .at(-1)!;
}

/** Yayından kalkış anı: bitiş gününün sonu (TSİ 23:59 → ertesi gün 00:00 TSİ = 21:00Z). */
export function bitisAni(sonGun: string): Date {
  return new Date(Date.parse(`${sonGun}T21:00:00Z`));
}
