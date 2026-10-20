import { foldTr } from '../places';

export interface PackDraft {
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  kcEndMax: number | null;
  maxHeightM: number | null;
}

function num(s: string): number | null {
  const m = s
    .replace(/\s/g, '')
    .replace(',', '.')
    .match(/^[+-]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Word tablosundan "Alan | Değer" satırlarıyla bitki paketi taslağı çıkarır.
 * Tanınan alanlar: Kc başlangıç, Kc orta, Kc son (zorunlu); Kc son en yüksek, en yüksek boy (m) (isteğe bağlı).
 * Eksik ya da makul aralık dışı (0 < Kc <= 2) değer HATADIR; değer tahmin edilmez.
 */
export function parsePackTable(tables: string[][][]): PackDraft {
  const found = new Map<string, number>();
  for (const t of tables) {
    for (const row of t) {
      if (row.length < 2) continue;
      const label = foldTr(row[0]!).replace(/\s+/g, ' ').trim();
      const v = num(row[1]!);
      if (v === null) continue;
      let key: string | null = null;
      if (/^kc (baslangic|ini)\b/.test(label)) key = 'ini';
      else if (/^kc (orta|mid)\b/.test(label)) key = 'mid';
      else if (/^kc (son|end)\b.*(en yuksek|maks)/.test(label)) key = 'endMax';
      else if (/^kc (son|end)\b/.test(label)) key = 'end';
      else if (/^en yuksek boy\b/.test(label)) key = 'height';
      if (key === null) continue;
      if (found.has(key)) throw new Error(`Tabloda "${row[0]}" birden fazla kez geçiyor`);
      found.set(key, v);
    }
  }
  const need = (k: string, ad: string) => {
    const v = found.get(k);
    if (v === undefined) throw new Error(`Tabloda "${ad}" satırı yok ya da sayı değil`);
    if (!(v > 0 && v <= 2)) throw new Error(`"${ad}" değeri 0 ile 2 arasında olmalı (${v})`);
    return v;
  };
  const kcIni = need('ini', 'Kc başlangıç');
  const kcMid = need('mid', 'Kc orta');
  const kcEnd = need('end', 'Kc son');
  const kcEndMax = found.has('endMax') ? need('endMax', 'Kc son (en yüksek)') : null;
  if (kcEndMax !== null && kcEndMax < kcEnd)
    throw new Error('Kc son (en yüksek), Kc son’dan küçük olamaz');
  const h = found.get('height');
  if (h !== undefined && !(h > 0 && h <= 100))
    throw new Error('En yüksek boy 0-100 m arasında olmalı');
  return { kcIni, kcMid, kcEnd, kcEndMax, maxHeightM: h ?? null };
}
