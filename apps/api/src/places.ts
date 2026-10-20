import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '@tarim/agro-core';

export interface Place {
  province: string;
  district: string;
  name: string;
  lat: number;
  lon: number;
}

export const DEFAULT_DATA_DIR =
  process.env['DATA_DIR'] ?? join(dirname(fileURLToPath(import.meta.url)), '../../../data');

/** Türkçe harflere duyarsız karşılaştırma anahtarı ("Şanlıurfa" ~ "sanliurfa", "I" ~ "ı"). */
export function foldTr(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

/** il > ilçe > yerleşim tablosu (data/yerlesim.csv, kaynak: GeoNames CC BY 4.0). */
export class Places {
  private readonly rows: Place[];
  constructor(csv: string) {
    const [, ...body] = parseCsv(csv);
    this.rows = body.map((r) => ({
      province: r[0]!,
      district: r[1]!,
      name: r[2]!,
      lat: Number(r[3]),
      lon: Number(r[4]),
    }));
  }

  static load(dataDir = DEFAULT_DATA_DIR): Places {
    return new Places(readFileSync(join(dataDir, 'yerlesim.csv'), 'utf8'));
  }

  get size(): number {
    return this.rows.length;
  }

  provinces(): string[] {
    return [...new Set(this.rows.map((r) => r.province))];
  }

  districts(province: string): string[] {
    const p = foldTr(province);
    return [...new Set(this.rows.filter((r) => foldTr(r.province) === p).map((r) => r.district))];
  }

  villages(province: string, district: string, query?: string): Place[] {
    const p = foldTr(province);
    const d = foldTr(district);
    const q = query ? foldTr(query) : '';
    return this.rows.filter(
      (r) =>
        foldTr(r.province) === p &&
        foldTr(r.district) === d &&
        (q === '' || foldTr(r.name).includes(q)),
    );
  }
}
