import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  accountDeleteSchema,
  consentCreateSchema,
  deviceCreateSchema,
  deviceRegisterSchema,
  fieldAccessGrantSchema,
  fieldCreateSchema,
  fieldUpdateSchema,
  otpRequestSchema,
  otpVerifySchema,
  profileUpdateSchema,
  roleGrantSchema,
  roleSchema,
  type FieldUpdate,
} from '@tarim/schemas';
import { adapterFor, validateRegistration } from '@tarim/devices';
import { FIELD_COLS, FIELD_COLUMN, insertField, withComputedArea } from './fields.logic';
import { Me, parse, Public, Roles, Token } from './auth/access';
import { AuthService } from './auth/auth.service';
import { DataService } from './data.service';
import { buildExport } from './wallet';
import type { Principal, Queryable } from './db/db';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  request(@Body() body: unknown) {
    return this.auth.requestOtp(parse(otpRequestSchema, body).phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verify(@Body() body: unknown) {
    const { phone, code } = parse(otpVerifySchema, body);
    return this.auth.verifyOtp(phone, code);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Me() me: Principal, @Token() token: string) {
    await this.auth.logout(token, me.userId);
  }
}

@Controller('fields')
export class FieldsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Post()
  create(@Me() me: Principal, @Body() body: unknown) {
    const f = parse(fieldCreateSchema, body);
    const checked = withComputedArea(f); // geçersiz sınır burada 400 olur
    return this.data.run(me, 'fields.create', (q) => insertField(q, me.userId, checked));
  }

  @Get()
  list(@Me() me: Principal) {
    return this.data.run(me, 'fields.list', (q) =>
      q.query(`SELECT ${FIELD_COLS} FROM fields ORDER BY created_at`),
    );
  }

  @Get(':id')
  get(@Me() me: Principal, @Param('id') id: string) {
    return this.data.runOne(me, 'fields.get', id, async (q) => {
      const [row] = await q.query(`SELECT ${FIELD_COLS} FROM fields WHERE id = $1`, [id]);
      return row;
    });
  }

  @Patch(':id')
  update(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const patch = withComputedArea(parse(fieldUpdateSchema, body));
    const keys = (Object.keys(patch) as (keyof FieldUpdate)[]).filter(
      (k) => patch[k] !== undefined,
    );
    return this.data.runOne(me, 'fields.update', id, async (q) => {
      if (keys.length === 0) {
        return (await q.query(`SELECT ${FIELD_COLS} FROM fields WHERE id = $1`, [id]))[0];
      }
      const sets = keys
        .map((k, i) => `${FIELD_COLUMN[k]} = $${i + 2}${k === 'boundary' ? '::jsonb' : ''}`)
        .join(', ');
      const [row] = await q.query(
        `UPDATE fields SET ${sets} WHERE id = $1 RETURNING ${FIELD_COLS}`,
        [
          id,
          ...keys.map((k) => (k === 'boundary' && patch[k] ? JSON.stringify(patch[k]) : patch[k])),
        ],
      );
      return row;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'fields.delete', id, async (q) => {
      const [row] = await q.query('DELETE FROM fields WHERE id = $1 RETURNING id', [id]);
      return row;
    });
  }

  /** Sahibi yakın/danışmana erişim verir (okuma ya da yazma). */
  @Post(':id/access')
  grant(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const g = parse(fieldAccessGrantSchema, body);
    return this.data.runOne(me, 'fields.access.grant', id, async (q) => {
      const [row] = await q.query(
        `INSERT INTO field_access(field_id, user_id, level) VALUES ($1,$2,$3)
         ON CONFLICT (field_id, user_id) DO UPDATE SET level = EXCLUDED.level
         RETURNING field_id AS "fieldId", user_id AS "userId", level`,
        [id, g.userId, g.level],
      );
      return row;
    });
  }

  @Delete(':id/access/:userId')
  @HttpCode(204)
  async revoke(@Me() me: Principal, @Param('id') id: string, @Param('userId') userId: string) {
    await this.data.runOne(me, 'fields.access.revoke', id, async (q) => {
      const [row] = await q.query(
        'DELETE FROM field_access WHERE field_id = $1 AND user_id = $2 RETURNING user_id',
        [id, userId],
      );
      return row;
    });
  }
}

@Controller('devices')
export class DevicesController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /**
   * Cihaz ekle (G21). `kind`/`method` verilmezse eski gövde ({fieldId, name}) sulama cihazı sayılır.
   * Sahiplik veritabanında (RLS): tarlaya YAZMA yetkisi olmayan kullanıcı cihaz ekleyemez (403).
   * Üretici/model/kaynak/adaptör sürümü künye olarak saklanır; üretici bulutu anahtarları yalnız sunucuda.
   */
  @Post()
  async create(@Me() me: Principal, @Body() body: unknown) {
    const raw = (body ?? {}) as Record<string, unknown>;
    if (raw['kind'] === undefined && raw['method'] === undefined) {
      const d = parse(deviceCreateSchema, body);
      return this.data.run(me, 'devices.create', async (q) => {
        const [row] = await q.query(
          `INSERT INTO devices(field_id, name) VALUES ($1,$2)
           RETURNING id, field_id AS "fieldId", name, kind, created_at AS "createdAt"`,
          [d.fieldId, d.name],
        );
        return row;
      });
    }
    const d = parse(deviceRegisterSchema, body);
    const v = validateRegistration(d);
    if (!v.ok) throw new BadRequestException(v.message);
    const adapter = adapterFor(d.method, process.env, d.providerId);
    const res = await adapter.connect({
      kind: d.kind,
      ...(d.pairingCode ? { pairingCode: d.pairingCode } : {}),
      ...(d.manufacturer ? { manufacturer: d.manufacturer } : {}),
      ...(d.model ? { model: d.model } : {}),
    });
    if (!res.ok) throw new BadRequestException(res.reason);
    const row = await this.data.runOne(me, 'devices.create', d.fieldId, async (q) => {
      // Tarla görünmüyorsa (başkasının ya da yok) satır dönmez: 403.
      const [f] = await q.query('SELECT id FROM fields WHERE id = $1', [d.fieldId]);
      if (!f) return undefined;
      const [ins] = await q.query(
        `INSERT INTO devices(field_id, name, kind, manufacturer, model, connection_method, provider_id,
           external_id, source, adapter_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, field_id AS "fieldId", name, kind, manufacturer, model,
           connection_method AS "connectionMethod", provider_id AS "providerId", source,
           adapter_version AS "adapterVersion", created_at AS "createdAt"`,
        [
          d.fieldId,
          d.name,
          d.kind,
          d.manufacturer ?? null,
          d.model ?? null,
          d.method,
          adapter.info.fake ? adapter.info.id : (d.providerId ?? null),
          res.externalId,
          adapter.info.id,
          adapter.info.version,
        ],
      );
      return ins;
    });
    return { ...(row as object), sample: adapter.info.fake, message: res.message };
  }

  @Get()
  list(@Me() me: Principal) {
    return this.data.run(me, 'devices.list', (q) =>
      q.query(
        `SELECT id, field_id AS "fieldId", name, kind, manufacturer, model,
                connection_method AS "connectionMethod", provider_id AS "providerId", source,
                adapter_version AS "adapterVersion", created_at AS "createdAt"
         FROM devices ORDER BY created_at`,
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'devices.delete', id, async (q) => {
      const [row] = await q.query('DELETE FROM devices WHERE id = $1 RETURNING id', [id]);
      return row;
    });
  }
}

/** KVKK: profil, rıza, veri dışa aktarma, hesap silme. */
@Controller('me')
export class MeController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  private profile(q: Queryable, me: Principal) {
    return q
      .query(
        `SELECT id, phone, display_name AS "displayName", created_at AS "createdAt" FROM users WHERE id = $1`,
        [me.userId],
      )
      .then((r) => ({ ...r[0], roles: me.roles }));
  }

  @Get()
  get(@Me() me: Principal) {
    return this.data.run(me, 'me.get', (q) => this.profile(q, me));
  }

  @Patch()
  update(@Me() me: Principal, @Body() body: unknown) {
    const { displayName } = parse(profileUpdateSchema, body);
    return this.data.run(me, 'me.update', async (q) => {
      await q.query('UPDATE users SET display_name = $2 WHERE id = $1', [me.userId, displayName]);
      return this.profile(q, me);
    });
  }

  @Post('consents')
  addConsent(@Me() me: Principal, @Body() body: unknown) {
    const c = parse(consentCreateSchema, body);
    return this.data.run(me, 'consents.create', async (q) => {
      const [row] = await q.query(
        `INSERT INTO consents(user_id, purpose, granted, policy_version) VALUES ($1,$2,$3,$4)
         RETURNING id, purpose, granted, policy_version AS "policyVersion", created_at AS "createdAt"`,
        [me.userId, c.purpose, c.granted, c.policyVersion],
      );
      return row;
    });
  }

  @Get('consents')
  consents(@Me() me: Principal) {
    return this.data.run(me, 'consents.list', (q) =>
      q.query(
        `SELECT id, purpose, granted, policy_version AS "policyVersion", created_at AS "createdAt"
         FROM consents ORDER BY created_at, id`,
      ),
    );
  }

  /** Veri taşınabilirliği: kullanıcıya ait her şey tek JSON olarak. */
  @Get('export')
  async export(@Me() me: Principal) {
    const out = await this.data.run(me, 'me.export', async (q) =>
      buildExport(q, me, await this.profile(q, me)),
    );
    await this.data.run(me, 'me.export', (q) =>
      q.query('SELECT write_audit($1, $2, $3, $4)', ['me.export', 'users', me.userId, '{}']),
    );
    return { exportedAt: new Date().toISOString(), ...out };
  }

  /** Hesap silme: kullanıcıya ait tüm veri silinir. Denetim satırları kimliksiz (yalnız UUID) kalır. */
  @Delete()
  @HttpCode(204)
  async delete(@Me() me: Principal, @Body() body: unknown) {
    parse(accountDeleteSchema, body);
    await this.data.run(me, 'me.delete', async (q) => {
      await q.query('SELECT write_audit($1, $2, $3, $4)', [
        'account.delete',
        'users',
        me.userId,
        '{}',
      ]);
      await q.query('DELETE FROM users WHERE id = $1', [me.userId]);
    });
  }
}

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Get('audit')
  audit(@Me() me: Principal, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    return this.data.run(me, 'admin.audit', (q) =>
      q.query(
        `SELECT seq, at, actor_id AS "actorId", action, entity, entity_id AS "entityId", hash
         FROM audit_log ORDER BY seq DESC LIMIT $1`,
        [n],
      ),
    );
  }

  @Get('audit/verify')
  async verifyAudit(@Me() me: Principal) {
    const [row] = await this.data.run(me, 'admin.audit.verify', (q) =>
      q.query<{ bad: string | null }>('SELECT verify_audit_chain()::text AS bad'),
    );
    return { ok: row!.bad === null, firstBrokenSeq: row!.bad === null ? null : Number(row!.bad) };
  }

  @Post('users/:id/roles')
  async grantRole(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { role } = parse(roleGrantSchema, body);
    await this.userExists(me, id);
    await this.data.run(me, 'admin.roles.grant', (q) =>
      q.query(
        'INSERT INTO user_roles(user_id, role, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, role, me.userId],
      ),
    );
    return { userId: id, role };
  }

  @Delete('users/:id/roles/:role')
  @HttpCode(204)
  async revokeRole(@Me() me: Principal, @Param('id') id: string, @Param('role') role: string) {
    const r = parse(roleSchema, role);
    await this.userExists(me, id);
    await this.data.run(me, 'admin.roles.revoke', (q) =>
      q.query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [id, r]),
    );
  }

  private async userExists(me: Principal, id: string) {
    const rows = await this.data.run(me, 'admin.users.get', (q) =>
      /^[0-9a-f-]{36}$/i.test(id)
        ? q.query('SELECT id FROM users WHERE id = $1', [id])
        : Promise.resolve([]),
    );
    if (rows.length === 0) throw new NotFoundException('Kullanıcı bulunamadı');
  }
}
