import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PgDb, PgliteDb, type Db, type Queryable } from './db';

/**
 * Test veritabanı. `TEST_DATABASE_URL` yoksa süreç içi PGlite (hızlı, verify için);
 * varsa gerçek PostgreSQL+PostGIS+pgvector sunucusunda bu test dosyasına özel geçici veritabanı
 * (`pnpm run test:integration`). Eklentiler migration'dan ÖNCE kurulur ki koşullu SQL'ler çalışsın.
 */
export function createTestDb(): Db {
  const admin = process.env['TEST_DATABASE_URL'];
  return admin ? new TempPgDb(admin) : new PgliteDb();
}

class TempPgDb implements Db {
  private inner: Promise<PgDb> | null = null;
  private readonly name = `tp_test_${randomBytes(6).toString('hex')}`;
  constructor(private readonly adminUrl: string) {}

  private open(): Promise<PgDb> {
    this.inner ??= (async () => {
      const admin = new pg.Client({ connectionString: this.adminUrl });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${this.name}`);
      await admin.end();
      const url = new URL(this.adminUrl);
      url.pathname = `/${this.name}`;
      const db = new PgDb(url.toString());
      await db.tx(async (q) => {
        await q.exec('CREATE EXTENSION IF NOT EXISTS postgis');
        await q.exec('CREATE EXTENSION IF NOT EXISTS vector');
      });
      return db;
    })();
    return this.inner;
  }

  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    return (await this.open()).tx(fn);
  }

  async close(): Promise<void> {
    if (!this.inner) return;
    await (await this.inner).close();
    const admin = new pg.Client({ connectionString: this.adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${this.name} WITH (FORCE)`);
    await admin.end();
  }
}
