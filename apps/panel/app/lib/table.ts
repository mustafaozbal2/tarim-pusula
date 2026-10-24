/** Liste ekranlarının ortak mantığı: arama, filtre, sıralama, sayfalama (saf işlevler; testli). */

export type Row = Record<string, string | number | boolean | null | undefined>;

export interface TableQuery {
  search: string;
  /** Sütun anahtarı → seçilen değer ('' = Tümü). */
  filters: Record<string, string>;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface TableResult<T extends Row> {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
}

const fold = (v: unknown) => String(v ?? '').toLocaleLowerCase('tr-TR');

const cmp = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), 'tr-TR', { numeric: true });
};

/** Önce arama ve filtre, sonra sıralama, en sonda sayfalama. Sayfa numarası aralığa sıkıştırılır. */
export function queryTable<T extends Row>(
  all: T[],
  searchKeys: string[],
  q: TableQuery,
): TableResult<T> {
  const needle = fold(q.search.trim());
  let rows = all.filter((r) => {
    for (const [k, v] of Object.entries(q.filters)) {
      if (v !== '' && String(r[k] ?? '') !== v) return false;
    }
    return !needle || searchKeys.some((k) => fold(r[k]).includes(needle));
  });
  if (q.sortKey) {
    const k = q.sortKey;
    const dir = q.sortDir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => dir * cmp(a[k], b[k]));
  }
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(Math.max(1, q.page), pageCount);
  return { rows: rows.slice((page - 1) * q.pageSize, page * q.pageSize), total, page, pageCount };
}

export const EMPTY_QUERY: TableQuery = {
  search: '',
  filters: {},
  sortKey: null,
  sortDir: 'asc',
  page: 1,
  pageSize: 10,
};

/** Sütun başlığına tıklayınca: aynı sütun yön değiştirir, yeni sütun artan başlar. */
export function nextSort(
  q: Pick<TableQuery, 'sortKey' | 'sortDir'>,
  key: string,
): Pick<TableQuery, 'sortKey' | 'sortDir'> {
  if (q.sortKey === key) return { sortKey: key, sortDir: q.sortDir === 'asc' ? 'desc' : 'asc' };
  return { sortKey: key, sortDir: 'asc' };
}

/** Filtre seçenekleri: satırlardaki benzersiz değerler (boşlar hariç), Türkçe sıralı. */
export function distinct(rows: Row[], key: string): string[] {
  return [
    ...new Set(rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== '')),
  ]
    .map(String)
    .sort((a, b) => a.localeCompare(b, 'tr-TR'));
}
