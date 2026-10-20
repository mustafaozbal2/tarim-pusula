import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, parseKcSeed } from '@tarim/agro-core';
import type { Db } from './db/db';
import { systemTx } from './db/db';
import { DEFAULT_DATA_DIR } from './places';

export const KC_SEED_SOURCE = 'FAO-56 Tablo 12 (Allen vd., 1998) - data/kc_fao56_seed.csv';
/** Tohum dosyasının sürümü (kaynak: PLAN v2, 19 Ekim 2026). */
export const KC_SEED_VERSION = '2026-10-19';
export const KC_SEED_RETRIEVED_AT = '2026-10-19T00:00:00Z';

export interface ImportResult {
  crops: number;
  packsCreated: number;
  packsUnchanged: number;
}

/**
 * Ürün listesini (data/crops_tr.csv) ve FAO-56 Kc tohumunu (data/kc_fao56_seed.csv) içe aktarır.
 * Tekrar çalıştırılabilir: değer değişmediyse yeni sürüm açmaz; değiştiyse sürüm+1 açar (eski sürüm kalır).
 * Tohum satırları taslak gelir; onay durumu bu içe aktarmada ASLA yükseltilmez.
 */
export async function importCropCatalog(db: Db, dataDir = DEFAULT_DATA_DIR): Promise<ImportResult> {
  const [, ...cropRows] = parseCsv(readFileSync(join(dataDir, 'crops_tr.csv'), 'utf8'));
  const seed = new Map(
    parseKcSeed(readFileSync(join(dataDir, 'kc_fao56_seed.csv'), 'utf8')).map((s) => [s.cropTr, s]),
  );
  const used = new Set<string>();
  const res: ImportResult = { crops: 0, packsCreated: 0, packsUnchanged: 0 };

  await systemTx(db, async (q) => {
    for (const [id, nameTr, nameEn, grp, lifespan, rank, seedKey] of cropRows) {
      await q.query(
        `INSERT INTO crops(id, name_tr, name_en, grp, lifespan, common_rank) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name_tr = EXCLUDED.name_tr, name_en = EXCLUDED.name_en,
           grp = EXCLUDED.grp, lifespan = EXCLUDED.lifespan, common_rank = EXCLUDED.common_rank`,
        [id, nameTr, nameEn, grp, lifespan, rank ? Number(rank) : null],
      );
      res.crops++;
      if (!seedKey) continue;
      const s = seed.get(seedKey);
      if (!s) throw new Error(`crops_tr.csv: tohumda bulunamayan anahtar "${seedKey}"`);
      used.add(seedKey);

      const [latest] = await q.query<{
        version: number;
        kc_ini: string;
        kc_mid: string;
        kc_end: string;
        kc_end_max: string | null;
      }>(
        `SELECT version, kc_ini, kc_mid, kc_end, kc_end_max FROM crop_pack_versions
         WHERE crop_id = $1 ORDER BY version DESC LIMIT 1`,
        [id],
      );
      const same =
        latest &&
        Number(latest.kc_ini) === s.kcIni &&
        Number(latest.kc_mid) === s.kcMid &&
        Number(latest.kc_end) === s.kcEnd &&
        (latest.kc_end_max === null ? null : Number(latest.kc_end_max)) === s.kcEndMax;
      if (same) {
        res.packsUnchanged++;
        continue;
      }
      await q.query(
        `INSERT INTO crop_pack_versions(crop_id, version, review_status, kc_ini, kc_mid, kc_end, kc_end_max,
           max_height_m, note, source, source_version, retrieved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          (latest?.version ?? 0) + 1,
          s.reviewStatus,
          s.kcIni,
          s.kcMid,
          s.kcEnd,
          s.kcEndMax,
          s.maxHeightM,
          s.note,
          `${KC_SEED_SOURCE}; ${s.source}`,
          KC_SEED_VERSION,
          KC_SEED_RETRIEVED_AT,
        ],
      );
      res.packsCreated++;
    }
  });
  const orphans = [...seed.keys()].filter((k) => !used.has(k));
  if (orphans.length > 0) {
    throw new Error(`Kc tohumunda ürün listesine bağlanmamış satır var: ${orphans.join('; ')}`);
  }
  return res;
}
