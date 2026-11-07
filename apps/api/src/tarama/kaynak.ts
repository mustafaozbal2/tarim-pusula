import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '@tarim/agro-core';
import { systemTx, type Db } from '../db/db';
import { DEFAULT_DATA_DIR } from '../places';

/**
 * data/resmi_kaynaklar.csv: taranacak resmi siteler (ad, tur, il, ilce, adres). Her adres elle/yoklamayla
 * doğrulanmıştır; Bakanlık ana sitesi robots.txt tarama izni vermediğinden listede YOKTUR (kural 6).
 * Tekrar çalıştırmak çift kayıt açmaz; yöneticinin kapattığı kaynak yeniden açılmaz.
 */
export async function importResmiKaynaklar(db: Db, dataDir = DEFAULT_DATA_DIR): Promise<number> {
  const [, ...rows] = parseCsv(readFileSync(join(dataDir, 'resmi_kaynaklar.csv'), 'utf8'));
  let n = 0;
  await systemTx(db, async (q) => {
    for (const [ad, tur, il, ilce, adres] of rows) {
      if (!ad || !adres) continue;
      const r = await q.query(
        `INSERT INTO official_sources(name, kind, province, district, url) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (url) DO NOTHING RETURNING id`,
        [ad, tur, il || null, ilce || null, adres],
      );
      n += r.length;
    }
  });
  return n;
}
