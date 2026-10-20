/**
 * Kütüphane / RAG çekirdeği (G6): parçalama, yerel gömme, benzerlik ve kaynak hiyerarşisi.
 *
 * Gömme: sağlayıcı anahtarı yokken de çalışan, belirlenimci "özellik karması" (hashing trick) —
 * sözcük + karakter 3'lü dizileri (Türkçe ek çeşitliliğine dayanıklı). Gerçek bir gömme sağlayıcısı
 * `Embedder` arayüzüyle takılabilir; sıralama mantığı aynı kalır.
 */

export type SourceTier = 'uzman-onayli' | 'kurum' | 'genel';

/** Küçük sayı = daha üst kaynak. Çelişkide üstteki kazanır (PLAN: uzman onaylı > kurum > genel). */
export const TIER_RANK: Record<SourceTier, number> = { 'uzman-onayli': 0, kurum: 1, genel: 2 };

export interface Embedder {
  readonly dim: number;
  readonly id: string;
  embed(text: string): number[];
}

export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  page: number;
  /** Doküman içi sıra (0'dan). */
  seq: number;
  text: string;
}

const TR_FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Küçük harfe çevirir (Türkçe İ/I kuralı dahil), aksanları sadeleştirir, harf-rakam dışını boşluk yapar. */
export function normalizeTr(s: string): string {
  const lower = s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
  let out = '';
  for (const ch of lower) out += TR_FOLD[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOP = new Set(
  'bir bu su ve ile de da mi mu icin gibi ne nasil ama veya en daha cok her olan olarak ya ki ise'.split(
    ' ',
  ),
);

export function tokenize(s: string): string[] {
  return normalizeTr(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export class HashEmbedder implements Embedder {
  readonly id = 'hash-v1';
  constructor(readonly dim = 512) {}

  embed(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0);
    for (const tok of tokenize(text)) {
      v[fnv1a('w:' + tok) % this.dim]! += 1;
      // Kök benzerliği: ilk 5 harf ve karakter 3'lüleri ("sulama" ~ "sulamak", "sulanir").
      if (tok.length > 5) v[fnv1a('p:' + tok.slice(0, 5)) % this.dim]! += 0.7;
      const padded = `^${tok}$`;
      for (let i = 0; i + 3 <= padded.length; i++) {
        v[fnv1a('g:' + padded.slice(i, i + 3)) % this.dim]! += 0.3;
      }
    }
    return l2(v);
  }
}

function l2(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  if (n === 0) return v;
  const s = 1 / Math.sqrt(n);
  return v.map((x) => x * s);
}

/** Birim vektörler için kosinüs = nokta çarpım; yine de normu hesaba katar. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error('Vektör boyutları farklı');
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export interface ChunkOptions {
  /** Hedef üst sınır (karakter). */
  maxChars?: number;
  /** Önceki parçadan taşınan son cümle(ler) için üst sınır. */
  overlapChars?: number;
}

/** Cümle sonlarından böler; kısaltma/ondalık (3.5) noktasında bölmez. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(])/u)
    .filter(Boolean);
}

/**
 * Sayfa sınırını aşmadan parçalar: her parça tek bir sayfaya aittir (kaynak/sayfa atfı için).
 * Cümleyi ortadan kesmez; tek başına `maxChars`'tan uzun cümle sözcük sınırından bölünür.
 */
export function chunkPages(pages: PageText[], opts: ChunkOptions = {}): Chunk[] {
  const max = opts.maxChars ?? 800;
  const overlap = Math.min(opts.overlapChars ?? 120, Math.floor(max / 3));
  const out: Chunk[] = [];
  for (const p of pages) {
    let cur = '';
    let tail = '';
    const flush = () => {
      const t = cur.trim();
      if (t) out.push({ page: p.page, seq: out.length, text: t });
      tail = overlapTail(t, overlap);
      cur = '';
    };
    for (const piece of sentences(p.text).flatMap((s) => splitLong(s, max))) {
      if (cur && cur.length + piece.length + 1 > max) {
        flush();
        cur = tail ? tail + ' ' : '';
      }
      cur += (cur && !cur.endsWith(' ') ? ' ' : '') + piece;
    }
    // Yalnız taşınan kuyruktan ibaret parça üretme.
    if (cur.trim() && cur.trim() !== tail.trim()) flush();
  }
  return out;
}

function splitLong(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const parts: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && cur.length + w.length + 1 > max) {
      parts.push(cur);
      cur = '';
    }
    cur += (cur ? ' ' : '') + w;
  }
  if (cur) parts.push(cur);
  return parts;
}

function overlapTail(text: string, overlap: number): string {
  if (overlap <= 0) return '';
  const ss = sentences(text);
  const last = ss[ss.length - 1];
  return last && last.length <= overlap ? last : '';
}

export interface Candidate {
  chunkId: string;
  documentId: string;
  text: string;
  page: number;
  tier: SourceTier;
  embedding: readonly number[];
  /** Kaynak bilgisi eksikse parça asla dönmez. */
  source: { title: string; publisher: string; date: string; version: string } | null;
}

export interface Ranked<C extends Candidate = Candidate> {
  chunk: C;
  score: number;
}

export function hasSource(c: Candidate): boolean {
  const s = c.source;
  return (
    !!s &&
    [s.title, s.publisher, s.date, s.version].every((x) => typeof x === 'string' && x.trim() !== '')
  );
}

export interface RankOptions {
  topK?: number;
  /** Bu eşiğin altındaki benzerlik "alakasız" sayılır ve dönmez (uydurma eşleşme yok). */
  minScore?: number;
}

/**
 * Sıralama: önce kaynaksız parçalar elenir, sonra eşiğin altı; kalanlar kaynak düzeyine
 * (uzman onaylı > kurum > genel), eşitlikte benzerliğe göre dizilir.
 */
export function rankChunks<C extends Candidate>(
  query: string,
  candidates: readonly C[],
  embedder: Embedder,
  opts: RankOptions = {},
): Ranked<C>[] {
  const q = embedder.embed(query);
  const min = opts.minScore ?? 0.12;
  return candidates
    .filter(hasSource)
    .map((chunk) => ({ chunk, score: cosine(q, chunk.embedding) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => TIER_RANK[a.chunk.tier] - TIER_RANK[b.chunk.tier] || b.score - a.score)
    .slice(0, opts.topK ?? 5);
}
