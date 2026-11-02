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
  if (!/^(duyuru\/)?[a-z0-9_]+\.(jpg|png)$/.test(name) || !existsSync(file)) return null;
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

export interface KurumKayit {
  kurum: string;
  kategori: UzmanKayit['kategori'];
  baslik: string;
  metin: string;
  kaynakNotu: string;
  gorsel: string;
  urunler: string[];
  /** Yayın tarihi: tohumun yazıldığı andan bu kadar gün önce. */
  gunOnce: number;
}

export interface KurumOrnek {
  surum: string;
  tarih: string;
  kayitlar: KurumKayit[];
}

interface GorselKaynak {
  dosya: string;
  yazar: string;
  lisans: string;
}

/** data/kurum_ornek.json: deneme sürümü için kurum ve uzman duyuruları (kiraz, fıstık, zeytin). */
export function readKurumOrnek(dataDir = DEFAULT_DATA_DIR): KurumOrnek {
  return JSON.parse(readFileSync(join(dataDir, 'kurum_ornek.json'), 'utf8')) as KurumOrnek;
}

/** Kurum duyurusunun kaynak adı: örnek veri olduğu adında yazar (kurum adı taklit edilmez). */
export const kurumKaynak = (kurum: string) => `${kurum} (örnek veri)`;

/** images/duyuru/KAYNAKLAR.json: fotoğrafın yazarı ve lisansı (CC BY/BY-SA atıf şartı). */
function fotoNotlari(dataDir: string): Map<string, string> {
  const file = join(dataDir, '..', 'images', 'duyuru', 'KAYNAKLAR.json');
  const m = new Map<string, string>();
  if (!existsSync(file)) return m;
  const k = JSON.parse(readFileSync(file, 'utf8')) as { gorseller: GorselKaynak[] };
  for (const g of k.gorseller) {
    const yazar = g.yazar ? `${g.yazar}, ` : '';
    m.set(`duyuru/${g.dosya}`, `Fotoğraf: ${yazar}Wikimedia Commons (${g.lisans}).`);
  }
  return m;
}

/**
 * Deneme sürümü kurum duyuruları. Kalıcı veritabanında (bulut) tohum bir kez yazıldığından bu işlev her
 * açılışta çalışır ve yalnız eksik kaydı ekler (aynı kurum + başlık varsa dokunmaz). Eklenen sayısını döner.
 */
export async function seedKurumOrnek(q: Queryable, now: Date, dataDir = DEFAULT_DATA_DIR) {
  const o = readKurumOrnek(dataDir);
  const foto = fotoNotlari(dataDir);
  let added = 0;
  for (const k of o.kayitlar) {
    const kaynak = kurumKaynak(k.kurum);
    const mevcut = await q.query(
      `SELECT 1 FROM announcements WHERE source_org = $1 AND title = $2 LIMIT 1`,
      [kaynak, k.baslik],
    );
    if (mevcut.length > 0) continue;
    const notlar = [k.kaynakNotu, foto.get(k.gorsel)].filter(Boolean).join('\n');
    await q.query(
      `INSERT INTO announcements(source_org, title, body, published_at, targeting, review_status,
         image_data_url, category)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'uzman-onayli', $6, $7)`,
      [
        kaynak,
        k.baslik,
        `${k.metin}\n\n${notlar}`,
        new Date(now.getTime() - k.gunOnce * 86_400_000),
        JSON.stringify({ places: [], circle: null, cropIds: k.urunler }),
        imageDataUrl(k.gorsel, dataDir),
        k.kategori,
      ],
    );
    added++;
  }
  return added;
}
