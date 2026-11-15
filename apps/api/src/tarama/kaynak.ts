import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '@tarim/agro-core';
import { systemTx, type Db } from '../db/db';
import { DEFAULT_DATA_DIR } from '../places';

/**
 * data/resmi_kaynaklar.csv: taranacak resmi siteler (ad, tur, il, ilce, adres, kalip, bicim). Her adres yoklamayla
 * doğrulanmıştır; Bakanlık ana sitesi ve DSİ robots.txt tarama izni vermediğinden listede YOKTUR (kural 6).
 * İl/ilçe boşsa kaynak ülke genelidir (TKDK, TMO, TARSİM, TÜİK, araştırma enstitüleri): haberi her çiftçiye gider.
 * `kalip`: haber bağlantısının yol kalıbı (boşsa /Haber/123/... ve /Duyuru/123/...). `bicim`: html ya da tuik.
 * Tekrar çalıştırmak çift kayıt açmaz; kalıp ve biçim dosyadan güncellenir; yöneticinin kapattığı kaynak açılmaz.
 */
export async function importResmiKaynaklar(db: Db, dataDir = DEFAULT_DATA_DIR): Promise<number> {
  const [, ...rows] = parseCsv(readFileSync(join(dataDir, 'resmi_kaynaklar.csv'), 'utf8'));
  let n = 0;
  await systemTx(db, async (q) => {
    for (const [ad, tur, il, ilce, adres, kalip, bicim] of rows) {
      if (!ad || !adres) continue;
      const r = await q.query<{ yeni: boolean }>(
        `INSERT INTO official_sources(name, kind, province, district, url, link_pattern, format)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (url) DO UPDATE SET link_pattern = EXCLUDED.link_pattern, format = EXCLUDED.format
         RETURNING (xmax = 0) AS yeni`,
        [ad, tur, il || null, ilce || null, adres, kalip || null, bicim || 'html'],
      );
      if (r[0]?.yeni) n += 1;
    }
  });
  return n;
}
