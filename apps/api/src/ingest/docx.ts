import type { PageText } from '@tarim/agro-core';
import { readZip } from './zip';

export interface DocxContent {
  pages: PageText[];
  /** Word tabloları: satır → hücre metinleri (bitki paketi gibi yapısal içerik için). */
  tables: string[][][];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Bir paragrafın (<w:p>) düz metni; sekme ve satır sonu korunur. */
function paragraphText(p: string): string {
  let out = '';
  for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)) {
    out += m[1] !== undefined ? decode(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n';
  }
  return out.trim();
}

const PAGE_BREAK = /<w:br\s[^>]*w:type="page"[^>]*\/>/;

/**
 * .docx → sayfalar + tablolar. Sayfa sınırı yalnız belgede AÇIKÇA konmuş sayfa sonlarıdır (Word'ün
 * otomatik sayfalaması dosyada yoktur); başka sayfa sayısı uydurulmaz. Tablo satırları metne
 * "hücre | hücre" olarak da girer, böylece aranabilir.
 */
export function docxToContent(data: Uint8Array): DocxContent {
  const files = readZip(data, (n) => n === 'word/document.xml');
  const xml = files.get('word/document.xml')?.toString('utf8');
  if (xml === undefined) throw new Error('Word belgesi değil (word/document.xml yok)');
  const body = xml.slice(xml.indexOf('<w:body'));
  const pages: PageText[] = [];
  const tables: string[][][] = [];
  let cur: string[] = [];
  const flush = () => {
    const text = cur.join('\n').trim();
    if (text) pages.push({ page: pages.length + 1, text });
    cur = [];
  };
  // En üst düzey öğeler: tablo ya da paragraf (iç içe tablo düz metne katılır).
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  for (const m of body.matchAll(re)) {
    const el = m[0];
    if (el.startsWith('<w:tbl>')) {
      const rows: string[][] = [];
      for (const r of el.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
        const cells = [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) =>
          [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
            .map((p) => paragraphText(p[0]))
            .filter(Boolean)
            .join(' '),
        );
        if (cells.some((c) => c !== '')) rows.push(cells);
      }
      tables.push(rows);
      for (const row of rows) cur.push(row.join(' | '));
    } else {
      if (/<w:pageBreakBefore/.test(el)) flush();
      el.split(PAGE_BREAK).forEach((seg, i) => {
        if (i > 0) flush();
        const t = paragraphText(seg);
        if (t) cur.push(t);
      });
    }
  }
  flush();
  return { pages, tables };
}
