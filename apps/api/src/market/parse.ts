/**
 * Kaynak yanıtı ayrıştırıcıları. Saf fonksiyonlar: metin girer, fiyat kaydı çıkar.
 * Her kayıt TL/kg'a çevrilir; kg/ton dışındaki birim (adet, demet, çuval...) atılır (uydurma çevrim yok).
 */

export interface PriceRecord {
  /** crops.id; tanınmayan ürün için null (saklanır ama pazar ekranında yer almaz). */
  cropId: string | null;
  productName: string;
  /** TL/kg */
  priceMin: number;
  priceMax: number;
  /** Fiyatın geçerli olduğu gün, YYYY-MM-DD. */
  priceDate: string;
}

const TR_FROM = 'çğıöşüâîûÇĞİÖŞÜÂÎÛ';
const TR_TO = 'cgiosuaiuCGIOSUAIU';

/** Küçük harf, aksansız, tek boşluklu karşılaştırma anahtarı. */
export function normalizeName(s: string): string {
  let out = '';
  for (const ch of s) {
    const i = TR_FROM.indexOf(ch);
    out += i >= 0 ? TR_TO[i]! : ch;
  }
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ürün adından ürün kimliği (data/crops_tr.csv). Yer fıstığı ve zeytinyağı Antep fıstığı/zeytin DEĞİLDİR. */
export function cropIdFor(name: string): string | null {
  const n = normalizeName(name);
  if (/yer fistigi|zeytinyag|fistik ezmesi/.test(n)) return null;
  if (/antep fistigi|^fistik\b|\bfistik\b/.test(n)) return 'antep-fistigi';
  if (/\bzeytin\b/.test(n)) return 'zeytin';
  if (/\bbugday\b/.test(n)) return 'bugday';
  if (/\barpa\b/.test(n)) return 'arpa';
  if (/\bpamuk\b/.test(n)) return 'pamuk';
  if (/\bdomates\b/.test(n)) return 'domates';
  return null;
}

/** Birim çarpanı (TL/birim -> TL/kg). Bilinmeyen birim: null. */
export function perKgFactor(unit: string): number | null {
  const u = normalizeName(unit).replace(/[^a-z/]/g, '');
  if (/^(kg|kilo|kilogram|tl\/kg)$/.test(u)) return 1;
  if (/^(ton|tl\/ton)$/.test(u)) return 1 / 1000;
  return null;
}

/** "1.250,50" -> 1250.5 ; "12,5" -> 12.5 ; "12.5" -> 12.5 ; geçersiz -> null */
export function parseTrNumber(s: string): number | null {
  const t = s.replace(/[^\d.,]/g, '');
  if (!t) return null;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : null;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
/** "19.10.2026" ya da "2026-10-19..." -> "2026-10-19" */
export function parseDay(s: string): string | null {
  const iso = ISO_DAY.exec(s.trim());
  if (iso) return iso[0];
  const m = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

function push(
  out: PriceRecord[],
  name: string,
  unit: string,
  lo: number | null,
  hi: number | null,
  day: string | null,
) {
  const f = perKgFactor(unit);
  if (f === null || day === null || lo === null || hi === null) return;
  // Veritabanı sütunuyla (numeric(12,4)) aynı duyarlık: ton -> kg çevriminde kayan nokta artığı kalmasın.
  const a = Math.round(lo * f * 1e4) / 1e4;
  const b = Math.round(hi * f * 1e4) / 1e4;
  if (!(a > 0) || !(b > 0)) return;
  // Alt > üst gelirse kaynak hatası: sessizce düzeltmek yerine ikisini sıralı alırız ama kaydı atmayız.
  out.push({
    cropId: cropIdFor(name),
    productName: name.trim(),
    priceMin: Math.min(a, b),
    priceMax: Math.max(a, b),
    priceDate: day,
  });
}

type Json = Record<string, unknown>;
const pick = (o: Json, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const asNum = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'string' ? parseTrNumber(v) : null;

/**
 * İBB Hal Fiyatları web servisi (halfiyatlaripublicdata.ibb.gov.tr): günlük ürün fiyatı listesi.
 * Alanlar: ProductName, UnitName, MinPrice, MaxPrice, Date. Dizi ya da { data | Data | result: [...] }.
 */
export function parseIbbHal(text: string): PriceRecord[] {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const rows: unknown[] = Array.isArray(j)
    ? j
    : Array.isArray((j as Json | null)?.['data'])
      ? ((j as Json)['data'] as unknown[])
      : Array.isArray((j as Json | null)?.['Data'])
        ? ((j as Json)['Data'] as unknown[])
        : [];
  const out: PriceRecord[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Json;
    const name = pick(o, 'ProductName', 'productName', 'Name');
    const unit = pick(o, 'UnitName', 'unitName', 'Unit');
    const date = pick(o, 'Date', 'date', 'PriceDate');
    if (typeof name !== 'string' || typeof unit !== 'string' || typeof date !== 'string') continue;
    push(
      out,
      name,
      unit,
      asNum(pick(o, 'MinPrice', 'minPrice', 'Min')),
      asNum(pick(o, 'MaxPrice', 'maxPrice', 'Max')),
      parseDay(date),
    );
  }
  return out;
}

const lastDayOfMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/**
 * TEPGE aylık piyasa tablosu (PDF'den çıkarılmış tablo, noktalı virgüllü metin):
 * `Ürün;Dönem;Birim;Fiyat` — Dönem "2026-09" ya da "09.2026"; fiyat o ayın ortalamasıdır (tek değer),
 * tarih olarak ayın son günü yazılır.
 */
export function parseTepge(text: string): PriceRecord[] {
  const out: PriceRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(';').map((s) => s.trim());
    if (c.length < 4) continue;
    const [name, period, unit, price] = c as [string, string, string, string];
    const m = /^(\d{4})-(\d{2})$/.exec(period) ?? /^(\d{2})\.(\d{4})$/.exec(period);
    if (!m) continue; // başlık satırı ya da bozuk satır
    const [y, mo] =
      m[1]!.length === 4 ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
    if (!y || !mo || mo < 1 || mo > 12) continue;
    const p = parseTrNumber(price);
    push(out, name, unit, p, p, lastDayOfMonth(y, mo));
  }
  return out;
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ticaret borsası günlük bülteni (HTML tablo): başlıkta "Tarih: gg.aa.yyyy"; satır:
 * Ürün | Cins | Birim | En düşük | En yüksek. Rakamlar Türkçe biçimli (1.250,50).
 */
export function parseBorsaBulletin(html: string): PriceRecord[] {
  const day = parseDay(/tarih\s*:\s*([\d./-]+)/i.exec(stripTags(html))?.[1] ?? '');
  const out: PriceRecord[] = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(stripTags);
    if (cells.length < 5) continue;
    const [product, kind, unit, lo, hi] = cells as [string, string, string, string, string];
    push(
      out,
      kind ? `${product} (${kind})` : product,
      unit,
      parseTrNumber(lo),
      parseTrNumber(hi),
      day,
    );
  }
  return out;
}
