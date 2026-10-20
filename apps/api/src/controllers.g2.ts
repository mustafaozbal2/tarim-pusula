import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { canDriveAdvice, needsDraftBadge, waterNeedAdvice, type CropStage } from '@tarim/agro-core';
import {
  fieldCreateSchema,
  nearbyClaimSchema,
  nearbyDecisionSchema,
  type FieldCreate,
} from '@tarim/schemas';
import { Me, parse } from './auth/access';
import { DataService } from './data.service';
import type { Principal, Queryable } from './db/db';
import { insertField, withComputedArea } from './fields.logic';
import type { Places } from './places';

export const PLACES = Symbol('PLACES');

/** il > ilçe > köy listesi (data/yerlesim.csv). */
@Controller('places')
export class PlacesController {
  constructor(@Inject(PLACES) private readonly places: Places) {}

  @Get('provinces')
  provinces() {
    return this.places.provinces();
  }

  @Get('districts')
  districts(@Query('province') province?: string) {
    if (!province) throw new BadRequestException('İl yazılmadı');
    return this.places.districts(province);
  }

  @Get('villages')
  villages(
    @Query('province') province?: string,
    @Query('district') district?: string,
    @Query('q') q?: string,
  ) {
    if (!province || !district) throw new BadRequestException('İl ve ilçe yazılmadı');
    return this.places.villages(province, district, q).slice(0, 300);
  }
}

export interface PackRow {
  id: string;
  version: number;
  reviewStatus: 'taslak-uzman-onayi-bekliyor' | 'uzman-onayli';
  kcIni: string;
  kcMid: string;
  kcEnd: string;
  kcEndMax: string | null;
  note: string | null;
  source: string;
  sourceVersion: string;
  retrievedAt: string;
}

const PACK_COLS = `id, version, review_status AS "reviewStatus", kc_ini AS "kcIni", kc_mid AS "kcMid",
  kc_end AS "kcEnd", kc_end_max AS "kcEndMax", note, source, source_version AS "sourceVersion",
  retrieved_at AS "retrievedAt"`;

/** Karar için kullanılacak sürüm: en yeni ONAYLI sürüm; yoksa en yeni (taslak) sürüm yalnız gösterim içindir. */
export async function pickPack(q: Queryable, cropId: string): Promise<PackRow | undefined> {
  const [approved] = await q.query<PackRow>(
    `SELECT ${PACK_COLS} FROM crop_pack_versions
     WHERE crop_id = $1 AND review_status = 'uzman-onayli' ORDER BY version DESC LIMIT 1`,
    [cropId],
  );
  if (approved) return approved;
  const [latest] = await q.query<PackRow>(
    `SELECT ${PACK_COLS} FROM crop_pack_versions WHERE crop_id = $1 ORDER BY version DESC LIMIT 1`,
    [cropId],
  );
  return latest;
}

export async function stagesOf(q: Queryable, packId: string): Promise<CropStage[]> {
  const rows = await q.query<{
    seq: number;
    name: string;
    kc: string | null;
    frost: string | null;
    status: CropStage['reviewStatus'];
  }>(
    `SELECT seq, name_tr AS name, kc, frost_critical_c AS frost, review_status AS status
     FROM crop_stages WHERE pack_id = $1 ORDER BY seq`,
    [packId],
  );
  return rows.map((r) => ({
    seq: r.seq,
    name: r.name,
    kc: r.kc === null ? null : Number(r.kc),
    frostCriticalC: r.frost === null ? null : Number(r.frost),
    reviewStatus: r.status,
  }));
}

@Controller('crops')
export class CropsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /** Tüm ürünler. `commonRank` dolu olanlar yaygın 6 üründür (büyük kutu). */
  @Get()
  list(@Me() me: Principal) {
    return this.data.run(me, 'crops.list', async (q) => {
      const rows = await q.query<{
        id: string;
        nameTr: string;
        group: string;
        lifespan: string;
        commonRank: number | null;
        version: number | null;
        reviewStatus: PackRow['reviewStatus'] | null;
      }>(
        `SELECT c.id, c.name_tr AS "nameTr", c.grp AS "group", c.lifespan, c.common_rank AS "commonRank",
                p.version, p.review_status AS "reviewStatus"
         FROM crops c
         LEFT JOIN LATERAL (
           SELECT version, review_status FROM crop_pack_versions WHERE crop_id = c.id
           ORDER BY (review_status = 'uzman-onayli') DESC, version DESC LIMIT 1) p ON true
         ORDER BY c.common_rank NULLS LAST, c.name_tr`,
      );
      return rows.map((r) => ({
        id: r.id,
        nameTr: r.nameTr,
        group: r.group,
        lifespan: r.lifespan,
        commonRank: r.commonRank,
        pack: r.version === null ? null : { version: r.version, reviewStatus: r.reviewStatus },
        // Paket yoksa ya da onaysızsa rozet gösterilir ve karar üretilmez.
        needsBadge: r.reviewStatus === null ? true : needsDraftBadge(r.reviewStatus),
        canDriveAdvice: r.reviewStatus === null ? false : canDriveAdvice(r.reviewStatus),
      }));
    });
  }

  @Get(':id')
  get(@Me() me: Principal, @Param('id') id: string) {
    return this.data.run(me, 'crops.get', async (q) => {
      const [crop] = await q.query<{ id: string; nameTr: string; group: string }>(
        'SELECT id, name_tr AS "nameTr", grp AS "group" FROM crops WHERE id = $1',
        [id],
      );
      if (!crop) throw new NotFoundException('Ürün bulunamadı');
      const pack = await pickPack(q, id);
      if (!pack) return { ...crop, pack: null, needsBadge: true, canDriveAdvice: false };
      return {
        ...crop,
        pack: {
          ...pack,
          kcIni: Number(pack.kcIni),
          kcMid: Number(pack.kcMid),
          kcEnd: Number(pack.kcEnd),
          kcEndMax: pack.kcEndMax === null ? null : Number(pack.kcEndMax),
          stages: await stagesOf(q, pack.id),
        },
        needsBadge: needsDraftBadge(pack.reviewStatus),
        canDriveAdvice: canDriveAdvice(pack.reviewStatus),
      };
    });
  }

  /**
   * Bitkinin su ihtiyacı (ETc = Kc × ET0). Onaysız paket için sayı DÖNMEZ: `advice.kind = "none"`.
   * ET0 şimdilik istemciden gelir; hava verisi G3'te sunucuya bağlanır.
   */
  @Get(':id/water-need')
  waterNeed(@Me() me: Principal, @Param('id') id: string, @Query('et0') et0?: string) {
    const value = Number(et0);
    if (et0 === undefined || !Number.isFinite(value) || value < 0 || value > 25) {
      throw new BadRequestException('et0 0 ile 25 mm/gün arasında bir sayı olmalı');
    }
    return this.data.run(me, 'crops.waterNeed', async (q) => {
      const pack = await pickPack(q, id);
      if (!pack) {
        return { cropId: id, advice: { kind: 'none', reason: 'deger-yok', badge: true } };
      }
      const advice = waterNeedAdvice(
        { reviewStatus: pack.reviewStatus, kcMid: Number(pack.kcMid) },
        undefined,
        value,
      );
      return {
        cropId: id,
        packVersion: pack.version,
        reviewStatus: pack.reviewStatus,
        source: pack.source,
        retrievedAt: pack.retrievedAt,
        advice,
      };
    });
  }
}

interface ProposalRow {
  id: string;
  ownerId: string;
  helperId: string;
  status: string;
  payload: unknown;
  createdAt: string;
}

/** "Yakınım yapsın": kod üret, yakın tarlayı önerir, çiftçi onaylar. */
@Controller('nearby')
export class NearbyController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Post('codes')
  async createCode(@Me() me: Principal) {
    const [row] = await this.data.run(me, 'nearby.code.create', (q) =>
      q.query<{ code: string; expires_at: Date }>(
        'SELECT code, expires_at FROM nearby_create_code()',
      ),
    );
    return { code: row!.code, expiresAt: new Date(row!.expires_at).toISOString() };
  }

  /** Yakının bu kodla önerdiği tarla (kimin kodu olduğu sızdırılmaz). */
  @Post('claim')
  @HttpCode(201)
  async claim(@Me() me: Principal, @Body() body: unknown) {
    const { code, field } = parse(nearbyClaimSchema, body);
    const checked = withComputedArea({ ...field, locationSource: 'yakin' as const });
    let id: string | null;
    try {
      const [row] = await this.data.run(me, 'nearby.claim', (q) =>
        q.query<{ id: string | null }>('SELECT nearby_claim($1, $2::jsonb) AS id', [
          code,
          JSON.stringify(checked),
        ]),
      );
      id = row!.id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'P0429' || err.message?.includes('cok-deneme')) {
        throw new HttpException('Çok fazla yanlış deneme. Bir saat sonra tekrar dene.', 429);
      }
      throw e;
    }
    if (!id) throw new NotFoundException('Kod geçersiz ya da süresi dolmuş');
    return { proposalId: id, status: 'pending' };
  }

  @Get('proposals')
  proposals(@Me() me: Principal) {
    return this.data.run(me, 'nearby.proposals', async (q) => {
      const rows = await q.query<ProposalRow>(
        `SELECT id, owner_id AS "ownerId", helper_id AS "helperId", status, payload,
                created_at AS "createdAt"
         FROM nearby_proposals ORDER BY created_at DESC`,
      );
      return rows.map((r) => ({ ...r, as: r.ownerId === me.userId ? 'owner' : 'helper' }));
    });
  }

  @Post('proposals/:id/decision')
  decide(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { approve } = parse(nearbyDecisionSchema, body);
    return this.data.runOne(me, 'nearby.decide', id, async (q) => {
      // Atomik: yalnız bekleyen ve bana ait öneri kararlanır (çift onay olmaz).
      const [p] = await q.query<{ helper_id: string; payload: unknown }>(
        `UPDATE nearby_proposals SET status = $2, decided_at = now()
         WHERE id = $1 AND owner_id = $3 AND status = 'pending' RETURNING helper_id, payload`,
        [id, approve ? 'approved' : 'rejected', me.userId],
      );
      if (!p) return undefined;
      if (!approve) {
        await q.query('SELECT write_audit($1,$2,$3,$4)', [
          'nearby.reject',
          'nearby_proposals',
          id,
          '{}',
        ]);
        return { status: 'rejected' as const, field: null };
      }
      const input: FieldCreate = parse(fieldCreateSchema, p.payload);
      const field = (await insertField(q, me.userId, { ...input, locationSource: 'yakin' })) as {
        id: string;
      };
      await q.query(
        `INSERT INTO field_access(field_id, user_id, level) VALUES ($1,$2,'read')
         ON CONFLICT (field_id, user_id) DO NOTHING`,
        [field.id, p.helper_id],
      );
      await q.query('UPDATE nearby_proposals SET field_id = $2 WHERE id = $1', [id, field.id]);
      await q.query('SELECT write_audit($1,$2,$3,$4)', [
        'nearby.approve',
        'nearby_proposals',
        id,
        '{}',
      ]);
      return { status: 'approved' as const, field };
    });
  }
}
