import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DB } from './auth/auth.service';
import { systemTx, userTx, type Db, type Principal, type Queryable } from './db/db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tüm yetkili veri erişimi buradan geçer: kullanıcı bağlamında (RLS altında) çalıştırır.
 * Yetki reddi (RLS ihlali ya da 0 satır) 403 olur ve ayrı bir denetim satırı bırakır.
 */
@Injectable()
export class DataService {
  constructor(@Inject(DB) readonly db: Db) {}

  async run<T>(p: Principal, action: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
    try {
      return await userTx(this.db, p, fn);
    } catch (e) {
      if ((e as { code?: string }).code === '42501') {
        await this.denied(p, action);
        throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
      }
      throw e;
    }
  }

  /** Satır döndürmesi beklenen yazma/okuma: boşsa yetkisiz (veya yok) demektir; sızıntı olmasın diye ikisi de 403. */
  async runOne<T>(
    p: Principal,
    action: string,
    id: string,
    fn: (q: Queryable) => Promise<T | undefined>,
  ): Promise<T> {
    if (!UUID.test(id)) throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
    const result = await this.run(p, action, fn);
    if (result === undefined) {
      await this.denied(p, action, id);
      throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
    }
    return result;
  }

  private async denied(p: Principal, action: string, entityId?: string): Promise<void> {
    await userTx(this.db, p, async (q) => {
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'access.denied',
        action,
        entityId ?? null,
        '{}',
      ]);
    });
  }

  /** Doğrudan sistem bağlamı: yalnız yönetim/KVKK işlemleri (hesap silme gibi) kullanır. */
  system<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    return systemTx(this.db, fn);
  }
}
