import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, type ReviewStatus } from '@tarim/agro-core';
import { DEFAULT_DATA_DIR, foldTr } from '../places';

/**
 * "Ne Eksem?" veri katmanı: üç CSV (data/). Her satır kaynak ve tarih taşır (kural 6).
 *  - denge_tuik.csv: TÜİK bitkisel ürün denge tabloları, yeterlilik derecesi (%).
 *  - havza_urun_deseni.csv: 8859 sayılı Cumhurbaşkanı Kararı (RG 29.08.2024) ilçe ürün deseni (OCR, taslak).
 *  - bahce_kisit.csv: yeni bahçe tesisi kısıtı (yeterlilik ≥ %150 kuralı; ikincil kaynak, taslak).
 */
export interface BalanceRow {
  cropId: string;
  tuikName: string;
  yeterlilikPct: number;
  period: string;
  source: string;
  date: string;
  note: string;
}
export interface PlanRow {
  province: string;
  district: string;
  crops: string[];
  source: string;
  date: string;
  note: string;
}
export interface RestrictionRow {
  cropId: string;
  name: string;
  rule: string;
  source: string;
  date: string;
  reviewStatus: ReviewStatus;
  note: string;
}

export class NeEksemData {
  readonly balance: Map<string, BalanceRow>;
  readonly plan: PlanRow[];
  readonly restrictions: Map<string, RestrictionRow>;

  constructor(balanceCsv: string, planCsv: string, restrictionCsv: string) {
    const [, ...b] = parseCsv(balanceCsv);
    this.balance = new Map(
      b
        .filter((r) => r[0])
        .map((r) => [
          r[0]!,
          {
            cropId: r[0]!,
            tuikName: r[1] ?? '',
            yeterlilikPct: Number(r[2]),
            period: r[3] ?? '',
            source: r[4] ?? '',
            date: r[5] ?? '',
            note: r[6] ?? '',
          },
        ]),
    );
    const [, ...p] = parseCsv(planCsv);
    this.plan = p
      .filter((r) => r[0])
      .map((r) => ({
        province: r[0]!,
        district: r[1] ?? '',
        crops: (r[2] ?? '').split('|').filter(Boolean),
        source: r[3] ?? '',
        date: r[4] ?? '',
        note: r[5] ?? '',
      }));
    const [, ...k] = parseCsv(restrictionCsv);
    this.restrictions = new Map(
      k
        .filter((r) => r[0])
        .map((r) => [
          r[0]!,
          {
            cropId: r[0]!,
            name: r[1] ?? '',
            rule: r[2] ?? '',
            source: r[3] ?? '',
            date: r[4] ?? '',
            reviewStatus: (r[5] as ReviewStatus) ?? 'taslak-uzman-onayi-bekliyor',
            note: r[6] ?? '',
          },
        ]),
    );
  }

  static load(dataDir = DEFAULT_DATA_DIR): NeEksemData {
    const rd = (f: string) => readFileSync(join(dataDir, f), 'utf8');
    return new NeEksemData(
      rd('denge_tuik.csv'),
      rd('havza_urun_deseni.csv'),
      rd('bahce_kisit.csv'),
    );
  }

  /** İlçenin resmî ürün deseni (yoksa null) ve il genelinde geçen ürünlerin birleşimi. */
  planFor(
    province: string | null,
    district: string | null,
  ): { district: PlanRow | null; provinceCrops: Set<string>; provinceRows: number } {
    const p = province ? foldTr(province) : '';
    const rows = p ? this.plan.filter((r) => foldTr(r.province) === p) : [];
    const d = district ? foldTr(district) : '';
    const row = d ? (rows.find((r) => foldTr(r.district) === d) ?? null) : null;
    return {
      district: row,
      provinceCrops: new Set(rows.flatMap((r) => r.crops)),
      provinceRows: rows.length,
    };
  }
}
