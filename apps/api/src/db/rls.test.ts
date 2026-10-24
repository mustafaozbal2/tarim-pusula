import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, systemTx, userTx, type Principal } from './db';
import { createTestDb } from './testdb';

const db = createTestDb();
let ali: Principal;
let veli: Principal;
let admin: Principal;
let aliField: string;

async function mkUser(phone: string, roles: string[]): Promise<Principal> {
  return systemTx(db, async (q) => {
    const [u] = await q.query<{ id: string }>('INSERT INTO users(phone) VALUES ($1) RETURNING id', [
      phone,
    ]);
    for (const r of roles) {
      await q.query('INSERT INTO user_roles(user_id, role) VALUES ($1, $2)', [u!.id, r]);
    }
    return { userId: u!.id, roles };
  });
}

beforeAll(async () => {
  await migrate(db);
  ali = await mkUser('+905320000001', ['farmer']);
  veli = await mkUser('+905320000002', ['farmer']);
  admin = await mkUser('+905320000003', ['admin']);
  aliField = await userTx(db, ali, async (q) => {
    const [f] = await q.query<{ id: string }>(
      "INSERT INTO fields(owner_id, name) VALUES ($1, 'Ali tarlası') RETURNING id",
      [ali.userId],
    );
    return f!.id;
  });
});
afterAll(() => db.close());

const count = (p: Principal, sql: string, params: unknown[] = []) =>
  userTx(db, p, async (q) => (await q.query(sql, params)).length);

describe('RLS: tarlalar', () => {
  it('sahibi kendi tarlasını görür', async () => {
    expect(await count(ali, 'SELECT * FROM fields')).toBe(1);
  });
  it('başka kullanıcı göremez', async () => {
    expect(await count(veli, 'SELECT * FROM fields')).toBe(0);
    expect(await count(veli, 'SELECT * FROM fields WHERE id = $1', [aliField])).toBe(0);
  });
  it('admin bile tarlayı göremez (veri minimizasyonu)', async () => {
    expect(await count(admin, 'SELECT * FROM fields')).toBe(0);
  });
  it('başkasının tarlasını güncelleyemez / silemez (0 satır)', async () => {
    const upd = await userTx(db, veli, (q) =>
      q.query("UPDATE fields SET name = 'ele geçirildi' WHERE id = $1 RETURNING id", [aliField]),
    );
    expect(upd).toHaveLength(0);
    const del = await userTx(db, veli, (q) =>
      q.query('DELETE FROM fields WHERE id = $1 RETURNING id', [aliField]),
    );
    expect(del).toHaveLength(0);
  });
  it('başkası adına tarla ekleyemez', async () => {
    await expect(
      userTx(db, veli, (q) =>
        q.query("INSERT INTO fields(owner_id, name) VALUES ($1, 'x')", [ali.userId]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('tarla sahibi sonradan değiştirilemez', async () => {
    await expect(
      systemTx(db, (q) =>
        q.query('UPDATE fields SET owner_id = $1 WHERE id = $2', [veli.userId, aliField]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('uygulama rolü owner_id sütununu güncelleyemez', async () => {
    await expect(
      userTx(db, ali, (q) => q.query('UPDATE fields SET owner_id = $1', [veli.userId])),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('RLS: erişim paylaşımı', () => {
  it('okuma yetkisi verilen görür ama yazamaz; yazma yetkisi yazar', async () => {
    await userTx(db, ali, (q) =>
      q.query("INSERT INTO field_access(field_id, user_id, level) VALUES ($1, $2, 'read')", [
        aliField,
        veli.userId,
      ]),
    );
    expect(await count(veli, 'SELECT * FROM fields')).toBe(1);
    const denied = await userTx(db, veli, (q) =>
      q.query("UPDATE fields SET name = 'yeni' WHERE id = $1 RETURNING id", [aliField]),
    );
    expect(denied).toHaveLength(0);
    await userTx(db, ali, (q) =>
      q.query("UPDATE field_access SET level = 'write' WHERE field_id = $1", [aliField]),
    );
    const ok = await userTx(db, veli, (q) =>
      q.query("UPDATE fields SET name = 'Ali tarlası' WHERE id = $1 RETURNING id", [aliField]),
    );
    expect(ok).toHaveLength(1);
  });
  it('erişim verilen kişi başkasına erişim veremez', async () => {
    await expect(
      userTx(db, veli, (q) =>
        q.query("INSERT INTO field_access(field_id, user_id, level) VALUES ($1, $2, 'read')", [
          aliField,
          admin.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('erişim silinince tarla tekrar görünmez', async () => {
    await userTx(db, ali, (q) =>
      q.query('DELETE FROM field_access WHERE field_id = $1', [aliField]),
    );
    expect(await count(veli, 'SELECT * FROM fields')).toBe(0);
  });
});

describe('RLS: kullanıcılar, roller, rıza, giriş tabloları', () => {
  it('kullanıcı yalnız kendini görür; admin hepsini', async () => {
    expect(await count(ali, 'SELECT * FROM users')).toBe(1);
    expect(await count(admin, 'SELECT * FROM users')).toBe(3);
  });
  it('kullanıcı kendine rol veremez', async () => {
    await expect(
      userTx(db, ali, (q) =>
        q.query("INSERT INTO user_roles(user_id, role) VALUES ($1, 'admin')", [ali.userId]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('rıza yalnız sahibine görünür ve değiştirilemez', async () => {
    await userTx(db, ali, (q) =>
      q.query(
        "INSERT INTO consents(user_id, purpose, granted, policy_version) VALUES ($1, 'konum-isleme', true, 'v1')",
        [ali.userId],
      ),
    );
    expect(await count(veli, 'SELECT * FROM consents')).toBe(0);
    expect(await count(ali, 'SELECT * FROM consents')).toBe(1);
    await expect(
      userTx(db, ali, (q) => q.query('UPDATE consents SET granted = false')),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('uygulama rolü OTP ve oturum tablolarına erişemez', async () => {
    await expect(userTx(db, ali, (q) => q.query('SELECT * FROM otp_codes'))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(userTx(db, ali, (q) => q.query('SELECT * FROM sessions'))).rejects.toMatchObject({
      code: '42501',
    });
  });
  it('kullanıcı kimliği olmayan bağlam hiçbir şey görmez', async () => {
    const rows = await db.tx(async (q) => {
      await q.exec('SET LOCAL ROLE tp_app');
      return q.query('SELECT * FROM fields');
    });
    expect(rows).toHaveLength(0);
  });
});

describe('audit_log', () => {
  const total = () =>
    systemTx(db, async (q) =>
      Number((await q.query<{ n: string }>('SELECT count(*)::text n FROM audit_log'))[0]!.n),
    );

  it('her yazma (ekle / güncelle / sil) satır üretir ve yapanı kaydeder', async () => {
    const before = await total();
    const id = await userTx(db, ali, async (q) => {
      const [f] = await q.query<{ id: string }>(
        "INSERT INTO fields(owner_id, name) VALUES ($1, 'denetim') RETURNING id",
        [ali.userId],
      );
      await q.query("UPDATE fields SET name = 'denetim2' WHERE id = $1", [f!.id]);
      await q.query('DELETE FROM fields WHERE id = $1', [f!.id]);
      return f!.id;
    });
    const rows = await systemTx(db, (q) =>
      q.query<{ action: string; actor_id: string }>(
        'SELECT action, actor_id FROM audit_log WHERE entity_id = $1 ORDER BY seq',
        [id],
      ),
    );
    expect(rows.map((r) => r.action)).toEqual(['insert.fields', 'update.fields', 'delete.fields']);
    expect(rows.every((r) => r.actor_id === ali.userId)).toBe(true);
    expect((await total()) - before).toBe(3);
  });
  it('UPDATE / DELETE / TRUNCATE sistem sahibi için bile reddedilir', async () => {
    await expect(
      systemTx(db, (q) => q.query("UPDATE audit_log SET action = 'x'")),
    ).rejects.toThrow();
    await expect(systemTx(db, (q) => q.query('DELETE FROM audit_log'))).rejects.toThrow();
    await expect(systemTx(db, (q) => q.query('TRUNCATE audit_log'))).rejects.toThrow();
  });
  it('uygulama rolü audit_log a doğrudan yazamaz', async () => {
    await expect(
      userTx(db, ali, (q) =>
        q.query(
          "INSERT INTO audit_log(actor_id, action, entity, prev_hash, hash) VALUES ($1, 'x', 'x', 'a', 'b')",
          [ali.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('kullanıcı yalnız kendi kayıtlarını görür; admin hepsini', async () => {
    const mine = await userTx(db, veli, (q) =>
      q.query<{ actor_id: string }>('SELECT actor_id FROM audit_log'),
    );
    expect(mine.every((r) => r.actor_id === veli.userId)).toBe(true);
    const all = await userTx(db, admin, (q) => q.query('SELECT 1 FROM audit_log'));
    expect(all.length).toBeGreaterThan(mine.length);
  });
  it('hash zinciri sağlam; kurcalanırsa tespit edilir', async () => {
    const ok = await systemTx(db, (q) =>
      q.query<{ v: string | null }>('SELECT verify_audit_chain() v'),
    );
    expect(ok[0]!.v).toBeNull();
    // Kötü niyetli DBA simülasyonu: tetikleyiciyi kapat, satırı bozmayı dene; sonunda işlem geri alınır.
    const broken = await db
      .tx(async (q) => {
        await q.exec('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
        await q.exec("UPDATE audit_log SET action = 'sahte' WHERE seq = 1");
        const r = await q.query<{ v: string }>('SELECT verify_audit_chain()::text v');
        throw Object.assign(new Error('geri al'), { v: r[0]!.v });
      })
      .catch((e: { v: string }) => e.v);
    expect(broken).toBe('1');
  });
});
