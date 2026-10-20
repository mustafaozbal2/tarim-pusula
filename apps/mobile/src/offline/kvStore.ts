import * as SQLite from 'expo-sqlite';
import type { KV } from './kv';

/** Cihaz deposu: expo-sqlite üstünde tek tablo. Çevrimdışı konum sırası burada durur. */
class SqliteKV implements KV {
  private db: Promise<SQLite.SQLiteDatabase> | null = null;

  private open() {
    this.db ??= (async () => {
      const db = await SQLite.openDatabaseAsync('tarim-pusula.db');
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL)',
      );
      return db;
    })();
    return this.db;
  }

  async get(key: string) {
    const db = await this.open();
    const row = await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', key);
    return row?.v ?? null;
  }

  async set(key: string, value: string) {
    const db = await this.open();
    await db.runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', key, value);
  }

  async remove(key: string) {
    const db = await this.open();
    await db.runAsync('DELETE FROM kv WHERE k = ?', key);
  }
}

export const kv: KV = new SqliteKV();
