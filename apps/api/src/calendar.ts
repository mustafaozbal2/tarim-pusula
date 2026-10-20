import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv, type CalendarTemplate, type ReviewStatus } from '@tarim/agro-core';
import type { Db, Queryable } from './db/db';
import { systemTx } from './db/db';
import { DEFAULT_DATA_DIR } from './places';

export interface TemplateRow {
  id: string;
  cropId: string;
  title: string;
  detail: string;
  stage: string | null;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  targeting: { places?: { province: string }[]; circle?: unknown; cropIds?: string[] };
  reviewStatus: ReviewStatus;
  source: string;
  sourceVersion: string;
  sourceDate: string | Date;
}

const COLS = `id, crop_id AS "cropId", title, detail, stage, start_month AS "startMonth",
  start_day AS "startDay", end_month AS "endMonth", end_day AS "endDay", targeting,
  review_status AS "reviewStatus", source, source_version AS "sourceVersion",
  to_char(source_date, 'YYYY-MM-DD') AS "sourceDate"`;

export async function templatesForCrop(q: Queryable, cropId: string): Promise<CalendarTemplate[]> {
  const rows = await q.query<TemplateRow>(
    `SELECT ${COLS} FROM calendar_templates WHERE crop_id = $1`,
    [cropId],
  );
  return rows.map((r) => ({
    id: r.id,
    cropId: r.cropId,
    title: r.title,
    detail: r.detail,
    stage: r.stage,
    startMonth: r.startMonth,
    startDay: r.startDay,
    endMonth: r.endMonth,
    endDay: r.endDay,
    places: (r.targeting.places ?? []) as CalendarTemplate['places'],
    circle: (r.targeting.circle ?? null) as CalendarTemplate['circle'],
    cropIds: r.targeting.cropIds ?? [],
    reviewStatus: r.reviewStatus,
    source: r.source,
    sourceVersion: r.sourceVersion,
    sourceDate: String(r.sourceDate),
  }));
}

const MD = /^(\d{1,2})-(\d{1,2})$/;
function parseMd(v: string, what: string, line: number): [number, number] {
  const m = MD.exec(v.trim());
  const month = m ? Number(m[1]) : 0;
  const day = m ? Number(m[2]) : 0;
  if (!m || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`takvim_sablon.csv satır ${line}: ${what} "AA-GG" olmalı (${v})`);
  }
  return [month, day];
}

export interface CalendarImportResult {
  created: number;
  unchanged: number;
}

/**
 * data/takvim_sablon.csv dosyasını içe aktarır. Kaynak, sürüm ve tarih ZORUNLUDUR (atıfsız satır hata verir).
 * Şablonlar her zaman taslak girer; onay durumu bu yolla yükseltilmez. Tekrar çalıştırmak çift kayıt açmaz;
 * var olan satırın içeriği değişmez (değişiklik = yeni başlık/kaynak sürümü ile yeni satır).
 */
export async function importCalendarTemplates(
  db: Db,
  dataDir = DEFAULT_DATA_DIR,
): Promise<CalendarImportResult> {
  const file = join(dataDir, 'takvim_sablon.csv');
  const res = { created: 0, unchanged: 0 };
  if (!existsSync(file)) return res;
  const [, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  await systemTx(db, async (q) => {
    let line = 1;
    for (const r of rows) {
      line++;
      if (r.every((c) => c.trim() === '')) continue;
      const [cropId, title, detail, stage, start, end, provinces, source, version, date] = r.map(
        (c) => c.trim(),
      );
      if (!cropId || !title || !detail)
        throw new Error(`takvim_sablon.csv satır ${line}: eksik alan`);
      if (!source || !version || !date) {
        throw new Error(`takvim_sablon.csv satır ${line}: kaynak, sürüm ve tarih zorunlu`);
      }
      const [sm, sd] = parseMd(start ?? '', 'başlangıç', line);
      const [em, ed] = parseMd(end ?? '', 'bitiş', line);
      const places = (provinces ?? '')
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
        .map((province) => ({ province }));
      const targeting = JSON.stringify({ places, circle: null, cropIds: [] });
      const out = await q.query(
        `INSERT INTO calendar_templates(crop_id, title, detail, stage, start_month, start_day,
           end_month, end_day, targeting, source, source_version, source_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
         ON CONFLICT (crop_id, title, start_month, start_day) DO NOTHING RETURNING id`,
        [cropId, title, detail, stage || null, sm, sd, em, ed, targeting, source, version, date],
      );
      if (out.length) res.created++;
      else res.unchanged++;
    }
  });
  return res;
}
