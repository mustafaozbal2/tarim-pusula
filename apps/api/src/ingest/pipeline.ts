import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Db, Queryable } from '../db/db';
import { systemTx } from '../db/db';
import { storeDocument } from '../library';
import { parsePackTable, type PackDraft } from './cropPack';
import { extractContent, type SourceFormat } from './extract';
import { kunyeSchema, type Kunye } from './kunye';

export const REVIEW_DRAFT = 'taslak-uzman-onayi-bekliyor';
const SOURCE_EXT = /\.(pdf|docx?|txt|md)$/i;
const KUNYE_SUFFIX = '.kunye.json';

export type Outcome = 'yuklendi' | 'ayni-icerik' | 'atlandi' | 'hata';

export interface FileResult {
  file: string;
  outcome: Outcome;
  reason?: string;
  kind?: Kunye['kind'];
  format?: SourceFormat;
  targetId?: string;
}

export interface IngestReport {
  files: FileResult[];
  counts: Record<Outcome, number>;
}

/** Klasör altındaki içerik dosyaları (sembolik bağlantılar izlenmez, gizli klasörler atlanır). */
export function listSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && SOURCE_EXT.test(name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

function readKunye(path: string): { kunye?: Kunye; error?: string } {
  let raw: string;
  try {
    raw = readFileSync(path + KUNYE_SUFFIX, 'utf8');
  } catch {
    return {
      error: `Künye dosyası yok (${path.split(/[\\/]/).pop()}${KUNYE_SUFFIX}); kaynak, tarih, sürüm ve lisans olmadan içe aktarılmaz`,
    };
  }
  try {
    const r = kunyeSchema.safeParse(JSON.parse(raw));
    if (r.success) return { kunye: r.data };
    return {
      error:
        'Künye geçersiz: ' +
        r.error.issues.map((i) => `${i.path.join('.') || '-'}: ${i.message}`).join('; '),
    };
  } catch {
    return { error: 'Künye JSON değil' };
  }
}

/** Aynı değerli bitki paketi varsa yeni sürüm açmaz; değiştiyse sürüm+1 (eski sürüm kalır). Her zaman taslak. */
async function storeCropPack(
  q: Queryable,
  k: Kunye,
  draft: PackDraft,
): Promise<{ id: string; created: boolean }> {
  const [crop] = await q.query<{ id: string }>('SELECT id FROM crops WHERE id = $1', [k.cropId]);
  if (!crop) throw new Error(`Ürün bulunamadı: ${k.cropId}`);
  const [latest] = await q.query<{
    id: string;
    version: number;
    kc_ini: string;
    kc_mid: string;
    kc_end: string;
    kc_end_max: string | null;
    max_height_m: string | null;
  }>(
    `SELECT id, version, kc_ini, kc_mid, kc_end, kc_end_max, max_height_m FROM crop_pack_versions
     WHERE crop_id = $1 ORDER BY version DESC LIMIT 1`,
    [k.cropId],
  );
  const n = (v: string | null) => (v === null ? null : Number(v));
  if (
    latest &&
    Number(latest.kc_ini) === draft.kcIni &&
    Number(latest.kc_mid) === draft.kcMid &&
    Number(latest.kc_end) === draft.kcEnd &&
    n(latest.kc_end_max) === draft.kcEndMax &&
    n(latest.max_height_m) === draft.maxHeightM
  ) {
    return { id: latest.id, created: false };
  }
  const [row] = await q.query<{ id: string }>(
    `INSERT INTO crop_pack_versions(crop_id, version, review_status, kc_ini, kc_mid, kc_end, kc_end_max,
       max_height_m, note, source, source_version, retrieved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      k.cropId,
      (latest?.version ?? 0) + 1,
      REVIEW_DRAFT,
      draft.kcIni,
      draft.kcMid,
      draft.kcEnd,
      draft.kcEndMax,
      draft.maxHeightM,
      'İçerik hattından (Word/PDF) alındı; uzman onayı bekliyor',
      `${k.publisher}: ${k.title}`,
      k.sourceVersion,
      k.sourceDate,
    ],
  );
  return { id: row!.id, created: true };
}

async function log(db: Db, r: FileResult, sha: string, k?: Kunye) {
  await systemTx(db, (q) =>
    q.query(
      `INSERT INTO ingest_log(file_name, file_sha256, format, kind, outcome, reason, source_title, publisher,
         source_date, source_version, target_id, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        r.file,
        sha,
        r.format ?? null,
        r.kind ?? null,
        r.outcome,
        r.reason ?? null,
        k?.title ?? null,
        k?.publisher ?? null,
        k?.sourceDate ?? null,
        k?.sourceVersion ?? null,
        r.targetId ?? null,
        r.outcome === 'yuklendi' ? REVIEW_DRAFT : null,
      ],
    ),
  );
}

async function ingestFile(db: Db, root: string, path: string): Promise<FileResult> {
  const file = relative(root, path).replaceAll('\\', '/');
  const data = new Uint8Array(readFileSync(path));
  const sha = createHash('sha256').update(data).digest('hex');
  const res: FileResult = { file, outcome: 'atlandi' };
  let kunye: Kunye | undefined;
  try {
    if (/\.doc$/i.test(path)) {
      res.reason = 'Eski .doc biçimi desteklenmiyor; Word’de .docx olarak kaydedin';
      return res;
    }
    const k = readKunye(path);
    if (!k.kunye) {
      res.reason = k.error!;
      return res;
    }
    kunye = k.kunye;
    res.kind = kunye.kind;
    const content = await extractContent(path, data);
    res.format = content.format;

    const prior = await systemTx(db, (q) =>
      q.query<{ target_id: string }>(
        `SELECT target_id FROM ingest_log WHERE file_sha256 = $1 AND kind = $2 AND outcome = 'yuklendi'
           AND source_version = $3 LIMIT 1`,
        [sha, kunye!.kind, kunye!.sourceVersion],
      ),
    );
    if (prior.length) {
      res.outcome = 'ayni-icerik';
      res.targetId = prior[0]!.target_id;
      res.reason = 'Bu dosya aynı sürümle daha önce yüklenmiş';
      return res;
    }
    if (kunye.kind === 'bitki-paketi') {
      const draft = parsePackTable(content.tables);
      const r = await systemTx(db, (q) => storeCropPack(q, kunye!, draft));
      res.targetId = r.id;
      res.outcome = r.created ? 'yuklendi' : 'ayni-icerik';
      if (!r.created) res.reason = 'Paket değerleri son sürümle aynı; yeni sürüm açılmadı';
    } else {
      if (content.pages.length === 0) {
        res.reason = 'Belgede okunabilir metin yok (taranmış PDF olabilir; OCR yok)';
        return res;
      }
      const r = await systemTx(db, (q) => storeDocument(q, null, kunye!, content.pages));
      res.targetId = r.id;
      res.outcome = 'yuklendi';
    }
    return res;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      res.outcome = 'ayni-icerik';
      res.reason = 'Aynı içerik ve sürüm kütüphanede zaten kayıtlı';
    } else {
      res.outcome = 'hata';
      res.reason = e instanceof Error ? e.message : 'Bilinmeyen hata';
    }
    return res;
  } finally {
    await log(db, res, sha, kunye);
  }
}

/**
 * Klasördeki Word/PDF/metin dosyalarını okur ve TASLAK olarak kütüphaneye / bitki paketine yükler.
 * Tek dosyadaki hata diğerlerini durdurmaz; her dosyanın sonucu `ingest_log` tablosuna yazılır.
 * Yükleme hiçbir kaydı onaylı yapmaz (onay yalnız uzman ucundan).
 */
export async function ingestFolder(db: Db, root: string): Promise<IngestReport> {
  const files: FileResult[] = [];
  for (const p of listSources(root)) files.push(await ingestFile(db, root, p));
  const counts: Record<Outcome, number> = { yuklendi: 0, 'ayni-icerik': 0, atlandi: 0, hata: 0 };
  for (const f of files) counts[f.outcome]++;
  return { files, counts };
}
