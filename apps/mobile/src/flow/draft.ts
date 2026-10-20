import { fieldCreateSchema, type FieldCreate, type LocationSource } from '@tarim/schemas';

/** "Tarla ekle" akışının ekranlar arası taslağı. Her konum yolu aynı taslağı doldurur. */
export interface FieldDraft {
  source: LocationSource | null;
  lat: number | null;
  lon: number | null;
  province?: string;
  district?: string;
  village?: string;
  cropId?: string;
  name?: string;
  /** "Yakınım yapsın" yardımcı tarafı: yakının verdiği 6 haneli kod. */
  claimCode?: string;
  /** Ekranlar arası kısa bilgi (ör. izin reddedildi). */
  notice?: 'gps-reddedildi';
}

export const emptyDraft = (): FieldDraft => ({ source: null, lat: null, lon: null });

export function withPoint(
  d: FieldDraft,
  p: { lat: number; lon: number },
  source: LocationSource,
  place?: { province?: string; district?: string; village?: string },
): FieldDraft {
  return { ...d, lat: p.lat, lon: p.lon, source, ...place, notice: undefined };
}

/** Haritada işaret taşındı: konum artık "haritada gösterilen" noktadır; köy adı eski kalır. */
export function movedOnMap(d: FieldDraft, p: { lat: number; lon: number }): FieldDraft {
  return { ...d, lat: p.lat, lon: p.lon, source: 'harita' };
}

export function defaultFieldName(d: FieldDraft): string {
  return d.village ? `${d.village} Bahçesi` : 'Tarlam';
}

export type DraftProblem = 'konum' | 'urun' | 'ad';

export function problems(d: FieldDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (d.lat === null || d.lon === null) out.push('konum');
  if (!d.cropId) out.push('urun');
  if (!(d.name ?? defaultFieldName(d)).trim()) out.push('ad');
  return out;
}

/** Sunucuya gidecek yük. Sorun varsa hata fırlatır (ekran önce `problems` ile denetler). */
export function toFieldPayload(d: FieldDraft): FieldCreate {
  const found = problems(d);
  if (found.length > 0) throw new Error(`Eksik bilgi: ${found.join(', ')}`);
  return fieldCreateSchema.parse({
    name: (d.name ?? defaultFieldName(d)).trim(),
    lat: d.lat,
    lon: d.lon,
    province: d.province,
    district: d.district,
    village: d.village,
    cropId: d.cropId,
    locationSource: d.source ?? undefined,
  });
}

/** Köy listesinde ad yoksa: ilçedeki köylerin ortalaması (yaklaşık nokta; harita adımında düzeltilir). */
export function centroid(
  points: { lat: number; lon: number }[],
): { lat: number; lon: number } | null {
  if (points.length === 0) return null;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
}
