import { BadRequestException } from '@nestjs/common';
import { polygonAreaDecare, type LonLat } from '@tarim/agro-core';
import type { FieldCreate, FieldUpdate } from '@tarim/schemas';
import type { Queryable } from './db/db';

export const FIELD_COLS = `id, owner_id AS "ownerId", name, province, district, village, lat, lon,
  area_decare AS "areaDecare", boundary, parcel_block AS "parcelBlock", parcel_no AS "parcelNo",
  location_source AS "locationSource", client_id AS "clientId", crop_id AS "cropId",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

/** Sınırdan alan (dekar). Geçersiz çokgen 400 olur. Sunucu hesabı istemcinin yazdığı alanın önüne geçer. */
export function areaFromBoundary(boundary: NonNullable<FieldCreate['boundary']>): number {
  const ring: LonLat[] = boundary.coordinates[0]!.map(([lon, lat]) => ({ lon, lat }));
  try {
    const area = polygonAreaDecare(ring);
    if (!(area > 0)) throw new RangeError('Sınır alanı sıfır');
    return Math.round(area * 1000) / 1000;
  } catch (e) {
    throw new BadRequestException((e as Error).message);
  }
}

/** Kayıt öncesi: sınır varsa alan ondan hesaplanır. */
export function withComputedArea<T extends FieldCreate | FieldUpdate>(f: T): T {
  if (f.boundary) return { ...f, areaDecare: areaFromBoundary(f.boundary) };
  return f;
}

export async function insertField(q: Queryable, ownerId: string, input: FieldCreate) {
  const f = withComputedArea(input);
  if (f.clientId) {
    const [existing] = await q.query(
      `SELECT ${FIELD_COLS} FROM fields WHERE owner_id = $1 AND client_id = $2`,
      [ownerId, f.clientId],
    );
    if (existing) return existing;
  }
  const [row] = await q.query(
    `INSERT INTO fields(owner_id, name, province, district, village, lat, lon, area_decare, boundary,
                        parcel_block, parcel_no, location_source, client_id, crop_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING ${FIELD_COLS}`,
    [
      ownerId,
      f.name,
      f.province,
      f.district,
      f.village,
      f.lat,
      f.lon,
      f.areaDecare,
      f.boundary ? JSON.stringify(f.boundary) : null,
      f.parcelBlock,
      f.parcelNo,
      f.locationSource,
      f.clientId,
      f.cropId,
    ].map((v) => v ?? null),
  );
  return row;
}

export const FIELD_COLUMN: Record<keyof FieldUpdate, string> = {
  name: 'name',
  province: 'province',
  district: 'district',
  village: 'village',
  lat: 'lat',
  lon: 'lon',
  areaDecare: 'area_decare',
  boundary: 'boundary',
  parcelBlock: 'parcel_block',
  parcelNo: 'parcel_no',
  cropId: 'crop_id',
  locationSource: 'location_source',
};
