import { Controller, Get, Inject } from '@nestjs/common';
import { Me, RequireMfa, Roles } from './auth/access';
import { DataService } from './data.service';
import type { Principal } from './db/db';

const STAFF = ['institution_admin', 'expert', 'admin'] as const;

/** +905321234567 → +90532 *** ** 67 (KVKK veri minimizasyonu: panelde tam numara gösterilmez). */
export function maskPhone(phone: string): string {
  const m = /^(\+90\d{3})\d{5}(\d{2})$/.exec(phone);
  return m ? `${m[1]} *** ** ${m[2]}` : '***';
}

/**
 * G17 yönetim paneli özetleri. Hepsi toplu/anonim bilgidir (kişi adı, tam telefon, tarla adı yok).
 * Sistem bağlamında okur (RLS tarla/cihaz sahibine bağlıdır) ama önce kullanıcı bağlamında denetim satırı yazar.
 */
@Controller('panel')
@Roles(...STAFF)
@RequireMfa()
export class PanelOverviewController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  private audit(me: Principal, action: string) {
    return this.data.run(me, action, (q) =>
      q.query('SELECT write_audit($1, $2, $3, $4)', [action, 'panel', null, '{}']),
    );
  }

  /** Ana sayfa özet kartları + son işlemler (yalnız işlem türü ve zaman; kişi bilgisi yok). */
  @Get('summary')
  async summary(@Me() me: Principal) {
    const reviewer = me.roles.includes('expert') || me.roles.includes('admin');
    const own = await this.data.run(me, 'panel.summary', async (q) => {
      const [a] = await q.query<{ n: string; pending: string }>(
        `SELECT count(*)::text AS n,
                count(*) FILTER (WHERE review_status = 'taslak-uzman-onayi-bekliyor')::text AS pending
         FROM announcements ${reviewer ? '' : 'WHERE created_by = $1'}`,
        reviewer ? [] : [me.userId],
      );
      let packs = 0;
      if (reviewer) {
        const [p] = await q.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM crop_pack_versions WHERE review_status = 'taslak-uzman-onayi-bekliyor')
                + (SELECT count(*) FROM crop_stages WHERE review_status = 'taslak-uzman-onayi-bekliyor') AS n`,
        );
        packs = Number(p!.n);
      }
      return { announcements: Number(a!.n), pending: Number(a!.pending) + packs };
    });
    const sys = await this.data.system(async (q) => {
      const [f] = await q.query<{ n: string }>('SELECT count(*)::text AS n FROM fields');
      const [d] = await q.query<{ n: string }>('SELECT count(*)::text AS n FROM devices');
      const recent = await q.query<{ at: Date; action: string; entity: string }>(
        `SELECT at, action, entity FROM audit_log
         WHERE action LIKE 'announcements.%' OR action LIKE 'panel.%' OR action LIKE '%crop%'
         ORDER BY seq DESC LIMIT 10`,
      );
      return {
        fields: Number(f!.n),
        devices: Number(d!.n),
        recent: recent.map((r) => ({
          at: new Date(r.at).toISOString(),
          action: r.action,
          entity: r.entity,
        })),
      };
    });
    return {
      announcements: own.announcements,
      pending: own.pending,
      fields: sys.fields,
      devices: sys.devices,
      recent: sys.recent,
    };
  }

  /** Arazi listesi: yer + ürün + alan. Tarla adı ve sahibi dönmez. */
  @Get('fields')
  @Roles('expert', 'admin')
  async fields(@Me() me: Principal) {
    await this.audit(me, 'panel.fields.list');
    return this.data.system((q) =>
      q.query(
        `SELECT f.id, f.province, f.district, f.village, f.crop_id AS "cropId",
                f.area_decare AS "areaDecare", f.created_at AS "createdAt",
                (SELECT count(*)::int FROM devices d WHERE d.field_id = f.id) AS "deviceCount"
         FROM fields f ORDER BY f.created_at DESC LIMIT 1000`,
      ),
    );
  }

  /** Cihazlar: tür, yer, vana durumu, son görülme. Sahibi dönmez. */
  @Get('devices')
  @Roles('admin')
  async devices(@Me() me: Principal) {
    await this.audit(me, 'panel.devices.list');
    return this.data.system((q) =>
      q.query(
        `SELECT d.id, d.name, d.kind, f.province, f.district, f.village,
                s.valve_open AS "valveOpen", s.last_seen_at AS "lastSeenAt", d.created_at AS "createdAt"
         FROM devices d JOIN fields f ON f.id = d.field_id
         LEFT JOIN device_state s ON s.device_id = d.id
         ORDER BY d.created_at DESC LIMIT 1000`,
      ),
    );
  }

  /** Personel (kurum yöneticisi, uzman, yönetici): maskeli telefon, roller, ikinci adım durumu. */
  @Get('users')
  @Roles('admin')
  async users(@Me() me: Principal) {
    await this.audit(me, 'panel.users.list');
    const rows = await this.data.system((q) =>
      q.query<{
        id: string;
        phone: string;
        createdAt: Date;
        roles: string[];
        mfaEnrolled: boolean;
      }>(
        `SELECT u.id, u.phone, u.created_at AS "createdAt",
                array_agg(r.role::text ORDER BY r.role::text) AS roles,
                bool_or(m.confirmed_at IS NOT NULL) AS "mfaEnrolled"
         FROM users u JOIN user_roles r ON r.user_id = u.id
         LEFT JOIN user_mfa m ON m.user_id = u.id
         WHERE r.role IN ('institution_admin', 'expert', 'admin')
         GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`,
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      phone: maskPhone(r.phone),
      roles: r.roles,
      mfaEnrolled: r.mfaEnrolled === true,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  }
}
