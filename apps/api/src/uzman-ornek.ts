import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Queryable } from './db/db';
import { DEFAULT_DATA_DIR } from './places';

export interface UzmanKayit {
  kategori: 'guncel' | 'bilgilendirme' | 'yonlendirme' | 'onlem' | 'teknoloji';
  baslik: string;
  metin: string;
  kaynakNotu: string;
  gorsel: string;
  urunler: string[];
}

export interface UzmanOrnek {
  kaynak: string;
  tarih: string;
  surum: string;
  kayitlar: UzmanKayit[];
}

/** data/uzman_ornek.json (G23 uzman test verileri). */
export function readUzmanOrnek(dataDir = DEFAULT_DATA_DIR): UzmanOrnek {
  return JSON.parse(readFileSync(join(dataDir, 'uzman_ornek.json'), 'utf8')) as UzmanOrnek;
}

/** images/<ad> dosyasını veri adresine çevirir (duyuru görseli). Dosya yoksa null. */
export function imageDataUrl(name: string, dataDir = DEFAULT_DATA_DIR): string | null {
  const file = join(dataDir, '..', 'images', name);
  if (!/^[a-z0-9_]+\.(jpg|png)$/.test(name) || !existsSync(file)) return null;
  const mime = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
}

/**
 * Demo: uzman test verilerini ONAYLI duyuru olarak yazar (slaytta görünür). Kaynak alanı "test verisi"
 * der; metnin sonunda kaynak notu vardır (kural 2: atıfsız iddia yok). Yalnız demo tohumunda çağrılır.
 */
export async function seedUzmanOrnek(q: Queryable, now: Date, dataDir = DEFAULT_DATA_DIR) {
  const o = readUzmanOrnek(dataDir);
  for (const [i, k] of o.kayitlar.entries()) {
    await q.query(
      `INSERT INTO announcements(source_org, title, body, published_at, targeting, review_status,
         image_data_url, category)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'uzman-onayli', $6, $7)`,
      [
        o.kaynak,
        k.baslik,
        `${k.metin}\n\n${k.kaynakNotu}`,
        new Date(now.getTime() - (i + 2) * 3_600_000),
        JSON.stringify({ places: [], circle: null, cropIds: k.urunler }),
        imageDataUrl(k.gorsel, dataDir),
        k.kategori,
      ],
    );
  }
  return o.kayitlar.length;
}
