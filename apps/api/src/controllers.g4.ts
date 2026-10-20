import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  explainMatch,
  fieldCalendar,
  isActive,
  matchesField,
  needsDraftBadge,
  type FieldSite,
  type ReviewStatus,
  type Targeting,
} from '@tarim/agro-core';
import { announcementCreateSchema } from '@tarim/schemas';
import { Me, parse, RequireMfa, Roles } from './auth/access';
import { templatesForCrop } from './calendar';
import { PLACES } from './controllers.g2';
import { DataService } from './data.service';
import type { Principal, Queryable } from './db/db';
import type { Places } from './places';
import { CLOCK } from './weather/tokens';

interface FieldRow {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  village: string | null;
  lat: number | null;
  lon: number | null;
  cropId: string | null;
}

interface AnnouncementRow {
  id: string;
  sourceOrg: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  publishedAt: Date | string;
  expiresAt: Date | string | null;
  targeting: Targeting;
  version: number;
  reviewStatus: ReviewStatus;
}

const ANN_COLS = `id, source_org AS "sourceOrg", title, body, source_url AS "sourceUrl",
  published_at AS "publishedAt", expires_at AS "expiresAt", targeting, version,
  review_status AS "reviewStatus"`;

const iso = (v: Date | string) => new Date(v).toISOString();

/** Bugünün tarihi Türkiye saatiyle (UTC+3, sabit; G3 ile aynı kabul). */
export function trToday(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

@Controller('fields')
export class FieldCalendarController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(PLACES) private readonly places: Places,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** Tarla okuması RLS altında; il bilinmiyorsa en yakın yerleşimden tahmin edilir. */
  private async loadField(
    me: Principal,
    action: string,
    id: string,
    extra?: (q: Queryable, site: FieldSite) => Promise<unknown>,
  ) {
    return this.data.runOne(me, action, id, async (q) => {
      const [f] = await q.query<FieldRow>(
        `SELECT id, name, province, district, village, lat, lon, crop_id AS "cropId"
         FROM fields WHERE id = $1`,
        [id],
      );
      if (!f) return undefined;
      const site = this.siteOf(f);
      return { f, site, extra: extra ? await extra(q, site) : undefined };
    });
  }

  private siteOf(f: FieldRow): FieldSite {
    const site: FieldSite = {
      province: f.province,
      district: f.district,
      village: f.village,
      lat: f.lat,
      lon: f.lon,
      cropId: f.cropId,
    };
    if (!site.province && f.lat !== null && f.lon !== null) {
      const near = this.places.nearest(f.lat, f.lon);
      if (near) {
        site.province = near.province;
        site.district = site.district ?? near.district;
      }
    }
    return site;
  }

  /** Ürün + yer + tarihe göre tarlanın takvimi. Ürün seçilmemişse boş (neden alanıyla). */
  @Get(':id/calendar')
  async calendar(@Me() me: Principal, @Param('id') id: string, @Query('days') daysQ?: string) {
    const days = daysQ === undefined ? 60 : Number(daysQ);
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      throw new BadRequestException('days 1 ile 366 arasında olmalı');
    }
    const { f, site, extra } = await this.loadField(me, 'fields.calendar', id, (q, s) =>
      s.cropId ? templatesForCrop(q, s.cropId) : Promise.resolve([]),
    );
    const today = trToday(this.now());
    return {
      fieldId: f.id,
      today,
      days,
      cropId: f.cropId,
      events: fieldCalendar(
        site,
        extra as Awaited<ReturnType<typeof templatesForCrop>>,
        today,
        days,
      ),
      note: f.cropId ? null : 'Takvim için tarlanın ürününü seçin.',
    };
  }

  /** Yalnız bu tarlayla eşleşen, yayında olan duyurular. Başka ilin duyurusu hiç dönmez. */
  @Get(':id/announcements')
  async announcements(@Me() me: Principal, @Param('id') id: string) {
    const { f, site, extra } = await this.loadField(me, 'fields.announcements', id, (q) =>
      q.query<AnnouncementRow>(
        `SELECT ${ANN_COLS} FROM announcements ORDER BY published_at DESC LIMIT 500`,
      ),
    );
    const now = this.now();
    const cards = (extra as AnnouncementRow[])
      .filter((a) => isActive(a, now) && matchesField(a.targeting, site))
      .map((a) => ({
        id: a.id,
        sourceOrg: a.sourceOrg,
        title: a.title,
        body: a.body,
        sourceUrl: a.sourceUrl,
        publishedAt: iso(a.publishedAt),
        expiresAt: a.expiresAt ? iso(a.expiresAt) : null,
        version: a.version,
        needsBadge: needsDraftBadge(a.reviewStatus),
        why: explainMatch(a.targeting, site),
      }));
    return { fieldId: f.id, announcements: cards };
  }
}

@Controller('announcements')
@RequireMfa()
export class AnnouncementsController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  /** Kurum duyurusu ekler; her zaman taslak başlar (uzman onayına kadar rozetli, bildirim üretmez). */
  @Post()
  @Roles('institution_admin', 'expert', 'admin')
  async create(@Me() me: Principal, @Body() body: unknown) {
    const a = parse(announcementCreateSchema, body);
    const [row] = await this.data.run(me, 'announcements.create', (q) =>
      q.query<{ id: string }>(
        `INSERT INTO announcements(source_org, title, body, source_url, published_at, expires_at,
           targeting, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
        [
          a.sourceOrg,
          a.title,
          a.body,
          a.sourceUrl ?? null,
          a.publishedAt,
          a.expiresAt ?? null,
          JSON.stringify(a.targeting),
          me.userId,
        ],
      ),
    );
    return { id: row!.id, reviewStatus: 'taslak-uzman-onayi-bekliyor' };
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('expert', 'admin')
  async approve(@Me() me: Principal, @Param('id') id: string) {
    await this.data.runOne(me, 'announcements.approve', id, async (q) => {
      const rows = await q.query(
        `UPDATE announcements SET review_status = 'uzman-onayli', reviewed_by = $2
         WHERE id = $1 RETURNING id`,
        [id, me.userId],
      );
      return rows.length ? true : undefined;
    });
    return { id, reviewStatus: 'uzman-onayli' };
  }

  /** Yönetim görünümü: kurum yöneticisi yalnız kendi duyurularını, uzman/yönetici hepsini görür. */
  @Get('managed')
  @Roles('institution_admin', 'expert', 'admin')
  managed(@Me() me: Principal) {
    const all = me.roles.includes('expert') || me.roles.includes('admin');
    return this.data.run(me, 'announcements.managed', (q) =>
      q.query(
        `SELECT ${ANN_COLS} FROM announcements
         ${all ? '' : 'WHERE created_by = $1'} ORDER BY published_at DESC LIMIT 200`,
        all ? [] : [me.userId],
      ),
    );
  }
}
