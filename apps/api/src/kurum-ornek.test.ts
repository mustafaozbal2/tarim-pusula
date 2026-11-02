import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, PgliteDb, systemTx } from './db/db';
import { DEFAULT_DATA_DIR } from './places';
import { imageDataUrl, kurumKaynak, readKurumOrnek, seedKurumOrnek } from './uzman-ornek';

const o = readKurumOrnek();
const cropIds = new Set(
  readFileSync(join(DEFAULT_DATA_DIR, 'crops_tr.csv'), 'utf8')
    .split('\n')
    .slice(1)
    .map((l) => l.split(',')[0]!.trim())
    .filter(Boolean),
);
const fotolar = (
  JSON.parse(
    readFileSync(join(DEFAULT_DATA_DIR, '..', 'images', 'duyuru', 'KAYNAKLAR.json'), 'utf8'),
  ) as { gorseller: { dosya: string; sayfa: string; lisans: string }[] }
).gorseller;

describe('Deneme sürümü kurum duyuruları (kiraz, fıstık, zeytin)', () => {
  const ofCrop = (id: string) => o.kayitlar.filter((k) => k.urunler.includes(id));

  it('her üründe en az 5 duyuru; bakanlık, il, ilçe ve uzman kaynakları var', () => {
    for (const id of ['elma-kiraz-armut', 'antep-fistigi', 'zeytin']) {
      expect(ofCrop(id).length, id).toBeGreaterThanOrEqual(5);
    }
    const kurumlar = o.kayitlar.map((k) => k.kurum).join(' | ');
    for (const tur of ['Bakanlığı', 'İl Tarım', 'İlçe Tarım', 'Uzman Ekibi', 'Enstitüsü']) {
      expect(kurumlar).toContain(tur);
    }
  });

  it('ürün kimlikleri katalogda var; her kayıt kaynaklı, görselli; doz ve ilaç adı yok', () => {
    for (const k of o.kayitlar) {
      for (const u of k.urunler) expect(cropIds.has(u), u).toBe(true);
      expect(k.kaynakNotu.startsWith('Kaynak:')).toBe(true);
      const url = imageDataUrl(k.gorsel);
      expect(url, k.gorsel).toMatch(/^data:image\/jpeg;base64,/);
      expect(url!.length).toBeLessThanOrEqual(300_000); // duyuru görseli sınırı (migration 0013)
      const low = `${k.baslik} ${k.metin}`.toLocaleLowerCase('tr-TR');
      expect(low).not.toMatch(/\d+\s*(ml|cc|gr|g|kg|kg\/da|lt|l|%)\b|karışım oranı|dozu/);
      // İlaç seçimi/uygulamasından söz eden her duyuru BKÜ kaydına ve etikete yönlendirir (kural 2).
      if (/ilaç seç|ilacı |ilaç ve uygulama|koruyucu uygulama/.test(low)) {
        expect(k.metin, k.baslik).toMatch(/BKÜ/);
      }
    }
    expect(new Set(o.kayitlar.map((k) => k.gorsel)).size).toBe(o.kayitlar.length);
  });

  it('her fotoğrafın lisansı ve kaynak sayfası kayıtlı; ticari olmayan/türetilemez lisans yok', () => {
    for (const k of o.kayitlar) {
      const f = fotolar.find((x) => `duyuru/${x.dosya}` === k.gorsel);
      expect(f, k.gorsel).toBeDefined();
      expect(f!.sayfa).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(f!.lisans).toMatch(/^(CC BY|CC0|Public domain)/);
      expect(f!.lisans).not.toMatch(/NC|ND/);
    }
  });

  it('tohum yalnız eksikleri yazar; kaynak adı örnek veri olduğunu söyler, metinde fotoğraf atfı var', async () => {
    const db = new PgliteDb();
    await migrate(db);
    const now = new Date('2026-11-02T09:00:00Z');
    expect(await systemTx(db, (q) => seedKurumOrnek(q, now))).toBe(o.kayitlar.length);
    expect(await systemTx(db, (q) => seedKurumOrnek(q, now))).toBe(0);
    const rows = await systemTx(db, (q) =>
      q.query<{ source_org: string; body: string; targeting: { cropIds: string[] } }>(
        `SELECT source_org, body, targeting FROM announcements`,
      ),
    );
    expect(rows).toHaveLength(o.kayitlar.length);
    for (const r of rows) {
      expect(r.source_org.endsWith('(örnek veri)')).toBe(true);
      expect(r.body).toMatch(/\n\nKaynak: .+\nFotoğraf: .+Wikimedia Commons/);
      expect(r.targeting.cropIds.length).toBeGreaterThan(0);
    }
    expect(kurumKaynak('X')).toBe('X (örnek veri)');
  }, 60_000);
});
