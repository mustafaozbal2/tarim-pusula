import 'reflect-metadata';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PgliteDb, systemTx } from './db/db';
import { DEMO_PG_CONF, demoSampleWeather, startDemo } from './demo-server';
import { PGlite } from '@electric-sql/pglite';

/**
 * Bulut (kalıcı veritabanı): demo sunucusu yeniden başlayınca tohum, tarla ve duyurular çiftlenmez;
 * çiftçinin eklediği tarla korunur. Burada kalıcı Postgres yerine aynı PGlite iki kez verilir.
 */
describe('demo sunucusu kalıcı veritabanında yeniden başlatma', () => {
  it('ikinci açılışta veri çiftlenmez, eklenen tarla kalır', async () => {
    process.env['DEMO_MODE'] = '1';
    const dir = mkdtempSync(join(tmpdir(), 'demo-web-'));
    writeFileSync(join(dir, 'index.html'), '<html>demo</html>');
    const db = new PgliteDb(new PGlite({ postgresqlconf: DEMO_PG_CONF }));
    const count = async (sql: string) =>
      Number((await systemTx(db, (q) => q.query<{ n: string }>(sql)))[0]!.n);
    const opts = {
      apiPort: 18241,
      webPort: 0,
      webDir: dir,
      db,
      weather: demoSampleWeather(),
    };

    const h1 = await startDemo(opts);
    const fields1 = await count('SELECT count(*) AS n FROM fields');
    const ann1 = await count('SELECT count(*) AS n FROM announcements');
    // Çiftçi kendi tarlasını ekler (kalıcı olmalı).
    await systemTx(db, (q) =>
      q.query(
        `INSERT INTO fields(owner_id, name, lat, lon)
         SELECT owner_id, 'Öğretmenin tarlası', 37.0, 37.3 FROM fields LIMIT 1`,
      ),
    );
    await h1.close();

    // Yeni süreç gibi: önceki bağlantı havuzu eski kapıya bağlı kalmasın diye başka kapı.
    const h2 = await startDemo({ ...opts, apiPort: 18242 });
    expect(await count('SELECT count(*) AS n FROM fields')).toBe(fields1 + 1);
    expect(await count('SELECT count(*) AS n FROM announcements')).toBe(ann1);
    expect(await count(`SELECT count(*) AS n FROM fields WHERE name = 'Öğretmenin tarlası'`)).toBe(
      1,
    );
    await h2.close();
  }, 180_000);
});
