import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { mfaCodeSchema, panelMenu, reasonSchema, stageCreateSchema } from '@tarim/schemas';
import { Me, parse, RequireMfa, Roles, Token } from './auth/access';
import { AuthService } from './auth/auth.service';
import { DataService } from './data.service';
import type { Principal, Queryable } from './db/db';

const STAFF = ['institution_admin', 'expert', 'admin'] as const;

/** Veritabanı işlevlerinin hata kodlarını HTTP'ye çevirir (yetkisizlik DataService'te 403 olur). */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    const msg = (e as Error).message;
    if (code === 'P0002') throw new NotFoundException(msg);
    if (code === '23514') throw new BadRequestException(msg);
    throw e;
  }
}

/** Panel girişi: ikinci adım (TOTP) kurulumu ve doğrulaması. İlk adım telefon SMS-OTP'dir. */
@Controller('panel/mfa')
@Roles(...STAFF)
export class PanelMfaController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  status(@Me() me: Principal) {
    return this.auth.mfaStatus(me);
  }

  @Post('enroll')
  @HttpCode(200)
  enroll(@Me() me: Principal) {
    return this.auth.mfaEnroll(me);
  }

  @Post('verify')
  @HttpCode(200)
  async verify(@Me() me: Principal, @Token() token: string, @Body() body: unknown) {
    await this.auth.mfaVerify(me, token, parse(mfaCodeSchema, body).code);
    return { ok: true };
  }

  /** Yönetici, telefonunu kaybeden personelin ikinci adımını sıfırlar; kişi yeniden kurar. */
  @Post('reset/:userId')
  @HttpCode(200)
  @Roles('admin')
  @RequireMfa()
  async reset(@Me() me: Principal, @Param('userId') userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new BadRequestException('Geçersiz kullanıcı');
    await this.auth.mfaReset(me, userId);
    return { ok: true };
  }
}

interface PackRow {
  packId: string;
  cropId: string;
  cropName: string;
  version: number;
  reviewStatus: string;
  kcIni: string;
  kcMid: string;
  kcEnd: string;
  source: string;
  sourceVersion: string;
  retrievedAt: Date | string;
}
interface StageRow {
  packId: string;
  seq: number;
  nameTr: string;
  kc: string | null;
  frostCriticalC: string | null;
  reviewStatus: string;
  source: string;
  enteredBy: string | null;
}

const PACK_SQL = `SELECT p.id AS "packId", p.crop_id AS "cropId", c.name_tr AS "cropName", p.version,
    p.review_status AS "reviewStatus", p.kc_ini AS "kcIni", p.kc_mid AS "kcMid", p.kc_end AS "kcEnd",
    p.source, p.source_version AS "sourceVersion", p.retrieved_at AS "retrievedAt"
  FROM crop_pack_versions p JOIN crops c ON c.id = p.crop_id`;
const STAGE_SQL = `SELECT pack_id AS "packId", seq, name_tr AS "nameTr", kc, frost_critical_c AS "frostCriticalC",
    review_status AS "reviewStatus", source, entered_by AS "enteredBy" FROM crop_stages`;

const DRAFT = 'taslak-uzman-onayi-bekliyor';

async function packsWithStages(q: Queryable, where = '') {
  const packs = await q.query<PackRow>(
    `${PACK_SQL} ${where} ORDER BY c.name_tr, p.version DESC LIMIT 500`,
  );
  const stages = await q.query<StageRow>(`${STAGE_SQL} ORDER BY pack_id, seq`);
  return packs.map((p) => ({
    ...p,
    retrievedAt: new Date(p.retrievedAt).toISOString(),
    stages: stages.filter((s) => s.packId === p.packId),
  }));
}

@Controller('panel')
@Roles(...STAFF)
@RequireMfa()
export class PanelController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /** Giriş yapan kişinin rolleri ve rolüne uygun menü. */
  @Get('me')
  me(@Me() me: Principal) {
    return { userId: me.userId, roles: me.roles, menu: panelMenu(me.roles) };
  }

  /** Uzman onay kuyruğu: onay bekleyen duyurular, bitki paketleri ve evreler. */
  @Get('review-queue')
  @Roles('expert', 'admin')
  async queue(@Me() me: Principal) {
    return this.data.run(me, 'panel.review-queue', async (q) => {
      const announcements = await q.query(
        `SELECT id, source_org AS "sourceOrg", title, body, source_url AS "sourceUrl",
           published_at AS "publishedAt", targeting, created_by AS "createdBy"
         FROM announcements WHERE review_status = $1 ORDER BY published_at DESC LIMIT 200`,
        [DRAFT],
      );
      const all = await packsWithStages(q);
      const packs = all.filter(
        (p) => p.reviewStatus === DRAFT || p.stages.some((s) => s.reviewStatus === DRAFT),
      );
      return { announcements, packs };
    });
  }

  /** Bitki paketleri (tüm sürümler) ve evreleri. */
  @Get('packs')
  @Roles('expert', 'admin')
  packs(@Me() me: Principal) {
    return this.data.run(me, 'panel.packs', (q) => packsWithStages(q));
  }

  @Post('packs/:id/approve')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async approvePack(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'panel.pack.approve', id, (q) =>
      guarded(async () => {
        await q.query('SELECT review_crop_pack($1)', [id]);
        return true;
      }),
    );
    return { id, reviewStatus: 'uzman-onayli' };
  }

  /** Taslak paketi reddeder (gerekçe zorunlu); reddedilen veri hiçbir öneriyi beslemez. */
  @Post('packs/:id/reject')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async rejectPack(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(reasonSchema, body);
    await this.data.runOne(me, 'panel.pack.reject', id, (q) =>
      guarded(async () => {
        await q.query('SELECT reject_crop_pack($1, $2)', [id, reason]);
        return true;
      }),
    );
    return { id, reviewStatus: 'reddedildi' };
  }

  /** Onaylı paketin onayını geri çeker; taslağa döner, yeniden onaylanana dek öneri üretmez. */
  @Post('packs/:id/revoke')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async revokePack(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { reason } = parse(reasonSchema, body);
    await this.data.runOne(me, 'panel.pack.revoke', id, (q) =>
      guarded(async () => {
        await q.query('SELECT revoke_crop_pack($1, $2)', [id, reason]);
        return true;
      }),
    );
    return { id, reviewStatus: DRAFT };
  }

  @Post('packs/:id/stages/:seq/reject')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async rejectStage(
    @Me() me: Principal,
    @Param('id') id: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() body: unknown,
  ) {
    const { reason } = parse(reasonSchema, body);
    await this.data.runOne(me, 'panel.stage.reject', id, (q) =>
      guarded(async () => {
        await q.query('SELECT reject_crop_stage($1, $2, $3)', [id, seq, reason]);
        return true;
      }),
    );
    return { packId: id, seq, reviewStatus: 'reddedildi' };
  }

  @Post('packs/:id/stages/:seq/revoke')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async revokeStage(
    @Me() me: Principal,
    @Param('id') id: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() body: unknown,
  ) {
    const { reason } = parse(reasonSchema, body);
    await this.data.runOne(me, 'panel.stage.revoke', id, (q) =>
      guarded(async () => {
        await q.query('SELECT revoke_crop_stage($1, $2, $3)', [id, seq, reason]);
        return true;
      }),
    );
    return { packId: id, seq, reviewStatus: DRAFT };
  }

  @Post('packs/:id/stages')
  @Roles('expert', 'admin')
  async addStage(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const s = parse(stageCreateSchema, body);
    const seq = await this.data.runOne(me, 'panel.stage.add', id, (q) =>
      guarded(async () => {
        const [r] = await q.query<{ seq: number }>(
          'SELECT add_crop_stage($1, $2, $3, $4, $5) AS seq',
          [id, s.nameTr, s.kc, s.frostCriticalC, s.source],
        );
        return r!.seq;
      }),
    );
    return { packId: id, seq, reviewStatus: DRAFT };
  }

  /** Evre onayı: girişi yapan kişi kendi girdisini onaylayamaz (403). */
  @Post('packs/:id/stages/:seq/approve')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async approveStage(
    @Me() me: Principal,
    @Param('id') id: string,
    @Param('seq', ParseIntPipe) seq: number,
  ) {
    if (seq < 1) throw new ConflictException('Geçersiz evre');
    await this.data.runOne(me, 'panel.stage.approve', id, (q) =>
      guarded(async () => {
        await q.query('SELECT review_crop_stage($1, $2)', [id, seq]);
        return true;
      }),
    );
    return { packId: id, seq, reviewStatus: 'uzman-onayli' };
  }
}
