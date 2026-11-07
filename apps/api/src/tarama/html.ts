/** Resmi site sayfalarından haber/duyuru ayıklama. Siteye özel değil, genel sezgiseldir; sayfa metni GÜVENİLMEYEN veridir. */

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ListeOgesi {
  url: string;
  title: string;
  /** "gg.aa.yyyy" ise ISO tarih (YYYY-MM-DD), yoksa null. */
  date: string | null;
}

const NEWS_PATH = /\/(Haber|Duyuru)\/\d+\/[^"'#?\s]+/i;

export function trDate(s: string): string | null {
  const m = /(\d{1,2})\.(\d{1,2})\.(20\d{2})/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Liste sayfasındaki haber/duyuru bağlantıları: yalnız kaynakla AYNI sunucudaki yollar. */
export function extractListItems(html: string, baseUrl: string): ListeOgesi[] {
  const base = new URL(baseUrl);
  const found = new Map<string, ListeOgesi>();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1] ?? '';
    const href = /href\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    if (!href) continue;
    let u: URL;
    try {
      u = new URL(decodeEntities(href), base);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || u.hostname !== base.hostname || !NEWS_PATH.test(u.pathname))
      continue;
    u.hash = '';
    const key = u.toString();
    const titleAttr = /\btitle\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
    const title = stripTags(titleAttr ?? m[2] ?? '');
    const date = trDate(/\bYayin\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? '');
    const prev = found.get(key);
    if (!prev || title.length > prev.title.length) {
      found.set(key, { url: key, title, date: date ?? prev?.date ?? null });
    } else if (!prev.date && date) prev.date = date;
  }
  return [...found.values()];
}

export interface Makale {
  title: string;
  text: string;
  image: string | null;
  date: string | null;
}

const MENU_WORDS = /erişilebilirlik|çerez|cookie|tüm hakları|site haritası|ana sayfa|menü/i;

export function extractArticle(html: string, pageUrl: string): Makale {
  const base = new URL(pageUrl);
  const clean = html.replace(/<(script|style|noscript|nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ');
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const paras: string[] = [];
  for (const m of clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = stripTags(m[1] ?? '');
    if (t.length >= 40 && !MENU_WORDS.test(t)) paras.push(t);
  }
  const text = paras.join('\n').slice(0, 3000);
  const abs = (src: string): string | null => {
    try {
      const u = new URL(decodeEntities(src), base);
      return u.protocol === 'https:' ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const og = /<meta[^>]+property\s*=\s*"og:image"[^>]+content\s*=\s*"([^"]+)"/i.exec(html)?.[1];
  let image = og ? abs(og) : null;
  if (!image) {
    for (const m of clean.matchAll(/<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
      const src = m[1] ?? '';
      if (/logo|icon|banner|sprite|\.svg/i.test(src)) continue;
      if (
        /FotografGalerisi|Belgeler|upload|images?\//i.test(src) &&
        /\.(jpe?g|png|webp)/i.test(src)
      ) {
        image = abs(src);
        if (image) break;
      }
    }
  }
  return { title, text, image, date: trDate(clean.slice(0, 20000)) };
}
