import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

export interface Db {
  /** Tek işlem. Hata olursa geri alınır. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Geliştirme ve test: süreç içi gerçek Postgres (WASM). RLS, tetikleyici ve işlevler birebir çalışır. */
export class PgliteDb implements Db {
  constructor(private readonly pglite: PGlite = new PGlite()) {}

  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    return this.pglite.transaction(async (t) =>
      fn({
        query: async <R>(sql: string, params?: unknown[]) =>
          (await t.query<R>(sql, params)).rows as R[],
        exec: async (sql) => {
          await t.exec(sql);
        },
      }),
    );
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }
}

/** Üretim: bağlantı havuzu. */
export class PgDb implements Db {
  private readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: async <R>(sql: string, params?: unknown[]) =>
          (await client.query(sql, params as unknown[])).rows as R[],
        exec: async (sql) => {
          await client.query(sql);
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Henüz uygulanmamış .sql dosyalarını adı sırasıyla uygular. */
export async function migrate(db: Db): Promise<string[]> {
  return db.tx(async (q) => {
    await q.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set(
      (await q.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name),
    );
    const applied: string[] = [];
    for (const file of readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (done.has(file)) continue;
      await q.exec(readFileSync(join(migrationsDir, file), 'utf8'));
      await q.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
      applied.push(file);
    }
    return applied;
  });
}

export interface Principal {
  userId: string;
  roles: string[];
  /** Oturum ikinci adımı (TOTP) geçti mi. Panel uçları bunu ister. */
  mfa?: boolean;
}

/**
 * Kullanıcı bağlamında işlem: RLS'yi atlayamayan `tp_app` rolüne düşer ve kullanıcı kimliğini
 * oturum ayarına yazar. Tüm yetkili sorgular buradan geçer.
 */
export function userTx<T>(db: Db, p: Principal, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return db.tx(async (q) => {
    await q.query("SELECT set_config('app.user_id', $1, true)", [p.userId]);
    await q.exec('SET LOCAL ROLE tp_app');
    return fn(q);
  });
}

/** Sistem bağlamı (giriş, OTP, oturum): yalnız sunucu içi kod kullanır, kullanıcı girdisiyle tetiklenen sorgularda parametre zorunlu. */
export function systemTx<T>(db: Db, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return db.tx(fn);
}
