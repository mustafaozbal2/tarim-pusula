import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { checkTargeting, scopeLabel, scopeOf, type Targeting } from '@tarim/agro-core';
import { staffDecisionSchema } from '@tarim/schemas';
import type { PushClient } from '@tarim/workers';
import { Me, parse, RequireMfa, Roles } from '../auth/access';
import { DataService } from '../data.service';
import { systemTx, type Db, type Principal } from '../db/db';
import { DB } from '../auth/auth.service';
import { PUSH } from '../weather/tokens';
import { notifyUser } from './notify';
import { PROFILE_COLS, resolveScope, type StaffProfileRow } from './scope';

/** Yetkili profili ve yayın kapsamı (G24). */
@Controller('staff')
export class StaffController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /** Giriş yapan yetkilinin profili, durumu ve kapsamı. Başvurusu yoksa `profile: null`. */
  @Get('me')
  async me(@Me() me: Principal) {
    const [p] = await this.data.run(me, 'staff.me', (q) =>
      q.query<StaffProfileRow>(`SELECT ${PROFILE_COLS} FROM staff_profiles WHERE user_id = $1`, [
        me.userId,
      ]),
    );
    const isAdmin = me.roles.includes('admin');
    const scope =
      isAdmin || !p
        ? me.roles.some((r) => r !== 'farmer')
          ? ({ level: 'ulke' } as const)
          : null
        : scopeOf({ institution: p.institution, province: p.province, district: p.district });
    return {
      profile: p ?? null,
      roles: me.roles,
      mfa: me.mfa,
      scope,
      scopeLabel: scope ? scopeLabel(scope) : null,
    };
  }

  /** Yetkilinin kendi yayınladığı duyurular (yeniden eskiye). */
  @Get('announcements')
  @RequireMfa()
  @Roles('institution_admin', 'expert', 'admin')
  mine(@Me() me: Principal) {
    return this.data.run(me, 'staff.announcements', (q) =>
      q.query(
        `SELECT id, title, body, category, targeting, review_status AS "reviewStatus",
           published_at AS "publishedAt", (image_data_url IS NOT NULL) AS "hasImage"
         FROM announcements WHERE created_by = $1 ORDER BY published_at DESC LIMIT 100`,
        [me.userId],
      ),
    );
  }
}

/**
 * Uzman onayı bekleyen taslaklar (kurum yetkilisi hazırladı): yalnız uzmanın yetki alanına düşenler.
 * Onaylanana kadar çiftçiye gitmez (değişmez kural 1).
 */
@Controller('staff/drafts')
export class StaffDraftsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Get()
  @RequireMfa()
  @Roles('expert', 'admin')
  list(@Me() me: Principal) {
    return this.data.run(me, 'staff.drafts', async (q) => {
      const scope = await resolveScope(q, me);
      const rows = await q.query<{ targeting: Targeting }>(
        `SELECT a.id, a.title, a.body, a.category, a.targeting, a.source_org AS "sourceOrg",
           a.published_at AS "publishedAt", (a.image_data_url IS NOT NULL) AS "hasImage",
           u.display_name AS "authorName"
         FROM announcements a LEFT JOIN users u ON u.id = a.created_by
         WHERE a.review_status = 'taslak-uzman-onayi-bekliyor'
         ORDER BY a.published_at DESC LIMIT 100`,
      );
      return rows.filter((r) => checkTargeting(scope, r.targeting).ok);
    });
  }
}

/** Yönetici: yetkili başvuruları ve karar (onay/ret). Onayda istenen rol verilir. */
@Controller('panel/staff')
@RequireMfa()
@Roles('admin')
export class StaffAdminController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH) private readonly push: PushClient,
  ) {}

  @Get()
  list(@Me() me: Principal) {
    return this.data.run(me, 'staff.applications', (q) =>
      q.query(
        `SELECT s.user_id AS "userId", s.institution, s.institution_name AS "institutionName",
           s.province, s.district, s.title, s.registry_no AS "registryNo", s.expertise,
           s.wants_role AS "wantsRole", s.status, s.decision_note AS "decisionNote",
           s.created_at AS "createdAt", u.display_name AS name, u.phone
         FROM staff_profiles s JOIN users u ON u.id = s.user_id
         ORDER BY (s.status = 'basvuru') DESC, s.created_at DESC LIMIT 200`,
      ),
    );
  }

  @Post(':userId/decision')
  @HttpCode(200)
  async decide(@Me() me: Principal, @Param('userId') userId: string, @Body() body: unknown) {
    const d = parse(staffDecisionSchema, body);
    // Karar staff_profiles denetim tetikleyicisiyle kayda geçer (kim, ne zaman, ne değişti).
    const ok = await systemTx(this.db, async (q) => {
      await q.query('SELECT set_config($1, $2, true)', ['app.user_id', me.userId]);
      const [p] = await q.query<{ wantsRole: string }>(
        `UPDATE staff_profiles SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
         WHERE user_id = $1 RETURNING wants_role AS "wantsRole"`,
        [userId, d.approve ? 'onayli' : 'reddedildi', me.userId, d.note ?? null],
      );
      if (!p) return false;
      if (d.approve) {
        await q.query(
          `INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [userId, p.wantsRole, me.userId],
        );
      } else {
        await q.query(`DELETE FROM user_roles WHERE user_id = $1 AND role <> 'farmer'`, [userId]);
      }
      await notifyUser(q, this.push, {
        userId,
        kind: 'basvuru',
        title: d.approve ? 'Yetkili başvurunuz onaylandı' : 'Yetkili başvurunuz reddedildi',
        body: d.approve
          ? 'Artık duyuru yayınlayabilir ve size gelen soruları cevaplayabilirsiniz.'
          : (d.note ?? 'Bilgilerinizi kontrol edip tekrar başvurabilirsiniz.'),
      });
      return true;
    });
    if (!ok) throw new NotFoundException('Başvuru bulunamadı');
    return { userId, status: d.approve ? 'onayli' : 'reddedildi' };
  }
}

/** Uygulama içi bildirim kutusu (zil): uzman cevabı, başvuru sonucu. */
@Controller('me/notifications')
export class InboxController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Get()
  list(@Me() me: Principal) {
    return this.data.run(me, 'inbox.list', (q) =>
      q.query(
        `SELECT id, kind, title, body, ref_id AS "refId", created_at AS "createdAt",
           read_at AS "readAt"
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [me.userId],
      ),
    );
  }

  @Post('read')
  @HttpCode(200)
  async read(@Me() me: Principal) {
    await this.data.run(me, 'inbox.read', (q) =>
      q.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
        me.userId,
      ]),
    );
    return { ok: true };
  }
}
