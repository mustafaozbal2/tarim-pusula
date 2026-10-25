import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FakeSmsProvider } from './auth/sms';
import { migrate, PgliteDb, systemTx } from './db/db';
import { withPlace } from './fields.logic';
import { Places } from './places';
import { imageDataUrl, readUzmanOrnek, seedUzmanOrnek } from './uzman-ornek';

const places = Places.load();

describe('G23.6 konumdan il/ilçe', () => {
  it('il boşsa en yakın yerleşimden doldurulur (Gaziantep, Şahinbey civarı)', () => {
    const f = withPlace(
      { name: 'ev', province: null, district: null, lat: 37.06, lon: 37.38 },
      places,
    );
    expect(f.province).toBe('Gaziantep');
    expect(typeof f.district).toBe('string');
  });
  it('il yazılmışsa dokunulmaz; konum yoksa değişmez', () => {
    const a = { province: 'Isparta', district: 'Merkez', lat: 37.06, lon: 37.38 };
    expect(withPlace(a, places)).toBe(a);
    const b = { province: null, district: null, lat: null, lon: null };
    expect(withPlace(b, places)).toBe(b);
  });
});

describe('G23.7 uzman test verileri', () => {
  const o = readUzmanOrnek();
  it('en az 7 kayıt, 5 kategorinin hepsi var', () => {
    expect(o.kayitlar.length).toBeGreaterThanOrEqual(7);
    const cats = new Set(o.kayitlar.map((k) => k.kategori));
    for (const c of ['guncel', 'bilgilendirme', 'yonlendirme', 'onlem', 'teknoloji']) {
      expect(cats.has(c as never)).toBe(true);
    }
  });
  it('her kayıt kaynak notlu, görselli; ilaç adı/doz yok; test verisi olduğu yazılı', () => {
    expect(o.kaynak).toContain('test verisi');
    for (const k of o.kayitlar) {
      expect(k.kaynakNotu.startsWith('Kaynak:')).toBe(true);
      const url = imageDataUrl(k.gorsel);
      expect(url, k.gorsel).toMatch(/^data:image\/(jpeg|png);base64,/);
      expect(url!.length).toBeLessThanOrEqual(300_000); // duyuru görseli sınırı (migration 0013)
      const low = `${k.baslik} ${k.metin}`.toLocaleLowerCase('tr-TR');
      expect(low).not.toMatch(/\d+\s*(ml|cc|gr|kg\/da|lt)\b|karışım oranı/);
    }
    // Aynı görsel iki kayıtta kullanılmaz (slaytta tekrar olmasın).
    expect(new Set(o.kayitlar.map((k) => k.gorsel)).size).toBe(o.kayitlar.length);
  });
  it('geçersiz görsel adı veri adresine çevrilmez (yol dışına çıkılamaz)', () => {
    expect(imageDataUrl('../package.json')).toBeNull();
  });
});

describe('G23 migration: kategori ve toprak türleri', () => {
  let db: PgliteDb;
  let app: INestApplication;
  const PORT = 18232;
  beforeAll(async () => {
    db = new PgliteDb();
    await migrate(db);
    app = await NestFactory.create(AppModule.register({ db, sms: new FakeSmsProvider() }), {
      logger: false,
    });
    await app.listen(PORT);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  });

  it("toprak türleri FAO-56 Tablo 19'un 9 doku sınıfı, her birinde çiftçi tarifi; FC > WP", async () => {
    const rows = await systemTx(db, (q) =>
      q.query<{ key: string; fc: number; wp: number; hint: string | null }>(
        'SELECT key, theta_fc::float8 AS fc, theta_wp::float8 AS wp, hint_tr AS hint FROM soil_types',
      ),
    );
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.fc).toBeGreaterThan(r.wp);
      expect(r.hint, r.key).toBeTruthy();
    }
    // Su tutma kapasitesi (FC-WP) kumdan kile artar: kumlu < tınlı < killi.
    const taw = (k: string) => rows.find((r) => r.key === k)!;
    expect(taw('kumlu').fc - taw('kumlu').wp).toBeLessThan(taw('tinli').fc - taw('tinli').wp);
  });

  it('uzman test duyuruları kategoriyle yazılır, geçersiz kategori reddedilir', async () => {
    const n = await systemTx(db, (q) => seedUzmanOrnek(q, new Date()));
    const cats = await systemTx(db, (q) =>
      q.query<{ category: string }>(
        `SELECT DISTINCT category FROM announcements WHERE review_status = 'uzman-onayli'`,
      ),
    );
    expect(n).toBeGreaterThanOrEqual(7);
    expect(cats.map((c) => c.category).sort()).toEqual(
      ['bilgilendirme', 'guncel', 'onlem', 'teknoloji', 'yonlendirme'].sort(),
    );
    await expect(
      systemTx(db, (q) =>
        q.query(
          `INSERT INTO announcements(source_org, title, body, published_at, category)
           VALUES ('x','x','x', now(), 'reklam')`,
        ),
      ),
    ).rejects.toThrow();
  });
});
