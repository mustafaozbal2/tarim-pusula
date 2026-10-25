import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { PgliteDb, migrate } from './db/db';
import { readOrnekIcerik, type OrnekIcerik } from './ornek-icerik';
import { DEFAULT_DATA_DIR } from './places';

const cropIds = readFileSync(join(DEFAULT_DATA_DIR, 'crops_tr.csv'), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(',')[0]!);

const SECTIONS = [
  'kartlar',
  'faaliyetZamani',
  'faaliyetRehberi',
  'erkenUyarilar',
  'destekler',
] as const;

const texts = (c: OrnekIcerik) =>
  SECTIONS.flatMap((k) => c[k].map((r) => ({ k, t: `${r.baslik} ${r.ozet}` })));

describe('örnek ana sayfa içeriği (G22, data/ornek_icerik)', () => {
  it('ürün listesi 45 ürün', () => {
    expect(cropIds).toHaveLength(45);
  });

  it.each(cropIds)(
    '%s: 5 kart + 4 sekmenin her birinde 5 kayıt (25 satır), kaynak/tarih/sürüm',
    (id) => {
      const c = readOrnekIcerik(id);
      expect(c).not.toBeNull();
      expect(c!.urunId).toBe(id);
      for (const k of SECTIONS) expect(c![k]).toHaveLength(5);
      expect(c!.kaynak).toBe('Örnek veri (demo)');
      expect(c!.tarih).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c!.surum).toBeTruthy();
      for (const r of c!.kartlar) expect(r.gorsel).toMatch(/^kart_[1-5]\.jpg$/);
      // Başlıklar ürüne duyarlı: kartların ve faaliyetlerin çoğu ürün adını içerir.
      const short = c!.urunAdi.replace(/\s*\(.*\)\s*$/, '').toLocaleLowerCase('tr-TR');
      const named = c!.faaliyetZamani.filter((r) =>
        r.baslik.toLocaleLowerCase('tr-TR').includes(short),
      );
      expect(named.length).toBe(5);
    },
  );

  it.each(cropIds)(
    '%s: ilaç adı, doz, karışım oranı, kesin tarih yok; oranlar yalnız "(örnek)"',
    (id) => {
      const c = readOrnekIcerik(id)!;
      for (const { k, t } of texts(c)) {
        const low = t.toLocaleLowerCase('tr-TR');
        // Doz/miktar birimleri
        expect(low).not.toMatch(/\d+\s*(ml|cc|g|gr|kg|lt|l|litre|gram)\b/);
        expect(low).not.toMatch(/\/\s*(da|dekar|100\s*l)/);
        expect(low).not.toMatch(/karışım oranı|dozu\s*\d/);
        // Yaygın etken madde adları (örnek liste): içerikte hiçbiri geçmez.
        expect(low).not.toMatch(
          /deltametrin|imidakloprid|glifosat|bakır sülfat|bordo bulamacı|kükürt|abamektin|mankozeb/,
        );
        // Kesin tarih (gün + ay adı) yok.
        expect(low).not.toMatch(
          /\d{1,2}\s*(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/,
        );
        // Yüzde/oran yalnız destek kayıtlarında ve "(örnek)" etiketiyle.
        if (/%\s*\d|\d\s*%/.test(t)) {
          expect(k).toBe('destekler');
          expect(t).toContain('(örnek)');
        }
      }
      for (const r of c.destekler) expect(r.baslik).toContain('(örnek)');
    },
  );

  it('ürünler arasında içerik farklıdır (ürüne duyarlı)', () => {
    const a = readOrnekIcerik('antep-fistigi')!;
    const z = readOrnekIcerik('zeytin')!;
    const d = readOrnekIcerik('domates')!;
    expect(a.faaliyetZamani[0]!.baslik).not.toBe(z.faaliyetZamani[0]!.baslik);
    expect(z.kartlar[0]!.baslik).not.toBe(d.kartlar[0]!.baslik);
    expect(a.erkenUyarilar[0]!.baslik).toContain('Antep fıstığı');
  });

  it('geçersiz kimlik ya da olmayan ürün: null (yol dışına çıkılamaz)', () => {
    expect(readOrnekIcerik('../package')).toBeNull();
    expect(readOrnekIcerik('yok-boyle-urun')).toBeNull();
  });

  it('gerçek modda (demo kapalı) uç yoktur: 404', async () => {
    const db = new PgliteDb();
    await migrate(db);
    const app = await NestFactory.create(AppModule.register({ db, sms: new FakeSmsProvider() }), {
      logger: false,
    });
    await app.listen(18231);
    try {
      const r = await fetch('http://127.0.0.1:18231/demo/ornek-icerik/zeytin');
      expect(r.status).toBe(404);
    } finally {
      await app.close();
    }
  }, 60_000);
});
