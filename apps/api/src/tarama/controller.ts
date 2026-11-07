import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Me, parse, Roles } from '../auth/access';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { TaramaService } from './servis';

const kaynakSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['bakanlik', 'il_mudurlugu', 'ilce_mudurlugu', 'universite', 'diger']),
  province: z.string().trim().min(2).max(60).optional(),
  district: z.string().trim().min(2).max(60).optional(),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^https:\/\/[^\s]+$/, 'Adres https ile başlamalı'),
});

interface KaynakDto {
  id: string;
  name: string;
  kind: string;
  province: string | null;
  district: string | null;
  url: string;
  active: boolean;
  lastCheckedAt: string | null;
  lastStatus: string | null;
  lastNewCount: number;
}

const COLS = `id, name, kind, province, district, url, active, last_checked_at AS "lastCheckedAt",
  last_status AS "lastStatus", last_new_count AS "lastNewCount"`;

/** "Resmi kaynaklar" sayfası: hangi sitelerin taranıp çiftçiye getirildiği herkese açıktır (şeffaflık). */
@Controller('resmi-kaynaklar')
export class ResmiKaynakController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Get()
  async list(@Me() me: Principal) {
    const rows = await this.data.run(me, 'resmi-kaynak.list', (q) =>
      q.query<KaynakDto>(
        `SELECT ${COLS} FROM official_sources WHERE active ORDER BY kind, province NULLS FIRST, name`,
      ),
    );
    return { sources: rows };
  }
}

@Controller('admin')
@Roles('admin')
export class TaramaAdminController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(TaramaService) private readonly tarama: TaramaService,
  ) {}

  /** Taramayı elle başlatır (robots.txt ve bekleme kuralları yine geçerli). */
  @Post('jobs/haber-tara')
  @HttpCode(200)
  tara() {
    return this.tarama.runAll();
  }

  @Get('kaynaklar')
  async all(@Me() me: Principal) {
    const rows = await this.data.run(me, 'resmi-kaynak.admin-list', (q) =>
      q.query<KaynakDto>(
        `SELECT ${COLS} FROM official_sources ORDER BY kind, province NULLS FIRST, name`,
      ),
    );
    return { sources: rows };
  }

  @Post('kaynaklar')
  async add(@Me() me: Principal, @Body() body: unknown) {
    const k = parse(kaynakSchema, body);
    const [row] = await this.data.run(me, 'resmi-kaynak.add', (q) =>
      q.query<{ id: string }>(
        `INSERT INTO official_sources(name, kind, province, district, url) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name, active = true RETURNING id`,
        [k.name, k.kind, k.province ?? null, k.district ?? null, k.url],
      ),
    );
    return { id: row!.id };
  }

  @Patch('kaynaklar/:id')
  async toggle(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const { active } = parse(z.object({ active: z.boolean() }), body);
    await this.data.run(me, 'resmi-kaynak.toggle', (q) =>
      q.query(`UPDATE official_sources SET active = $2 WHERE id = $1`, [id, active]),
    );
    return { ok: true };
  }
}
