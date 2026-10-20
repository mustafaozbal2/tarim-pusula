import { cropEvapotranspiration } from './kc';
import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';

/** Sürümlü Bitki Bilgi Paketi (PLAN §4). Her alan kaynak + tarih + sürüm + onay durumu taşır. */
export interface CropStage {
  seq: number;
  name: string;
  kc: number | null;
  /** Bu evrede ciddi hasar başlatan en düşük sıcaklık (°C); onaylı değilse uyarıda kullanılmaz. */
  frostCriticalC: number | null;
  reviewStatus: ReviewStatus;
}

export interface CropPack {
  cropId: string;
  version: number;
  reviewStatus: ReviewStatus;
  kcIni: number;
  kcMid: number;
  /** Aralıklı değerlerde alt sınır (ör. "0.25-0.4" için 0.25). */
  kcEnd: number;
  kcEndMax: number | null;
  stages: CropStage[];
  source: string;
  sourceVersion: string;
  retrievedAt: string;
}

export interface SeedRow {
  cropTr: string;
  cropFao: string;
  kcIni: number;
  kcMid: number;
  kcEnd: number;
  kcEndMax: number | null;
  maxHeightM: number | null;
  note: string;
  source: string;
  reviewStatus: ReviewStatus;
}

/** RFC 4180 benzeri küçük CSV ayrıştırıcı (tırnaklı alan, çift tırnak kaçışı). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

function parseKc(raw: string, field: string): { min: number; max: number | null } {
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/);
  if (!m) throw new Error(`Geçersiz Kc değeri (${field}): "${raw}"`);
  const min = Number(m[1]);
  const max = m[2] === undefined ? null : Number(m[2]);
  if (max !== null && max < min) throw new Error(`Kc aralığı ters (${field}): "${raw}"`);
  return { min, max };
}

/** data/kc_fao56_seed.csv satırlarını doğrulayarak okur. Bilinmeyen onay durumu taslak sayılır. */
export function parseKcSeed(csv: string): SeedRow[] {
  const [header, ...body] = parseCsv(csv);
  if (!header) throw new Error('Boş Kc dosyası');
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Kc dosyasında "${name}" sütunu yok`);
    return i;
  };
  const idx = {
    tr: col('crop_tr'),
    fao: col('crop_fao'),
    ini: col('kc_ini'),
    mid: col('kc_mid'),
    end: col('kc_end'),
    h: col('max_height_m'),
    note: col('note'),
    source: col('source'),
    status: col('review_status'),
  };
  return body.map((r) => {
    const ini = parseKc(r[idx.ini]!, 'kc_ini');
    const mid = parseKc(r[idx.mid]!, 'kc_mid');
    const end = parseKc(r[idx.end]!, 'kc_end');
    const status: ReviewStatus =
      r[idx.status] === 'uzman-onayli' ? 'uzman-onayli' : 'taslak-uzman-onayi-bekliyor';
    const h = r[idx.h]?.trim();
    return {
      cropTr: r[idx.tr]!.trim(),
      cropFao: r[idx.fao]!.trim(),
      kcIni: ini.min,
      kcMid: mid.min,
      kcEnd: end.min,
      kcEndMax: end.max,
      maxHeightM: h ? Number(h) : null,
      note: r[idx.note]?.trim() ?? '',
      source: r[idx.source]!.trim(),
      reviewStatus: status,
    };
  });
}

/** Karar üretmeyen bilgi (öneri ya da uyarı yok); neden her zaman açıklanır. */
export interface NoAdvice {
  kind: 'none';
  reason: 'uzman-onayi-bekliyor' | 'deger-yok';
  /** Arayüzde rozet gösterilsin mi. */
  badge: boolean;
}

export interface WaterNeedAdvice {
  kind: 'water-need';
  /** ETc = Kc × ET0, mm/gün (FAO-56 Denklem 58). */
  etcMmPerDay: number;
  kc: number;
}

export interface FrostAdvice {
  kind: 'frost';
  /** Tahmin edilen en düşük sıcaklık eşiğin altında mı. */
  atRisk: boolean;
  thresholdC: number;
}

function blocked(status: ReviewStatus, hasValue: boolean): NoAdvice | null {
  if (!canDriveAdvice(status)) {
    return { kind: 'none', reason: 'uzman-onayi-bekliyor', badge: needsDraftBadge(status) };
  }
  if (!hasValue) return { kind: 'none', reason: 'deger-yok', badge: false };
  return null;
}

/** Bitkinin su ihtiyacı. Paket onaylı değilse hiçbir sayı üretmez (değişmez kural 1). */
export function waterNeedAdvice(
  pack: Pick<CropPack, 'reviewStatus' | 'kcMid'>,
  stage: Pick<CropStage, 'kc' | 'reviewStatus'> | undefined,
  et0MmPerDay: number,
): WaterNeedAdvice | NoAdvice {
  const kc = stage?.kc ?? pack.kcMid;
  const statusOk = stage ? stage.reviewStatus : pack.reviewStatus;
  const b = blocked(pack.reviewStatus, true) ?? blocked(statusOk, stage?.kc !== null);
  if (b) return b;
  return { kind: 'water-need', kc, etcMmPerDay: cropEvapotranspiration(kc, et0MmPerDay) };
}

/** Don uyarısı. Evrenin eşiği onaylı değilse uyarı üretmez. */
export function frostAdvice(
  stage: Pick<CropStage, 'frostCriticalC' | 'reviewStatus'> | undefined,
  forecastMinC: number,
): FrostAdvice | NoAdvice {
  if (!stage) return { kind: 'none', reason: 'deger-yok', badge: false };
  const b = blocked(stage.reviewStatus, stage.frostCriticalC !== null);
  if (b) return b;
  return {
    kind: 'frost',
    atRisk: forecastMinC <= stage.frostCriticalC!,
    thresholdC: stage.frostCriticalC!,
  };
}
