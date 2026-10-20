import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);

export const targetPlaceSchema = z
  .object({
    province: text(60),
    district: text(60).optional(),
    village: text(60).optional(),
  })
  .refine((p) => !p.village || !!p.district, { message: 'Köy için ilçe de yazılmalı' });

export const targetCircleSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(500),
});

/** Hedefleme: il/ilçe/köy girdileri, isteğe bağlı daire ve ürün listesi. Boş = kısıtsız. */
export const targetingSchema = z.object({
  places: z.array(targetPlaceSchema).max(100).default([]),
  circle: targetCircleSchema.nullable().default(null),
  cropIds: z.array(text(60)).max(100).default([]),
});

/** Kurum duyurusu: kaynak kurum ve tarih zorunlu (atıfsız duyuru yok). */
export const announcementCreateSchema = z
  .object({
    sourceOrg: text(120),
    title: text(160),
    body: text(2000),
    sourceUrl: z.url().max(500).optional(),
    publishedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().optional(),
    targeting: targetingSchema.default({ places: [], circle: null, cropIds: [] }),
  })
  .refine((a) => !a.expiresAt || a.expiresAt > a.publishedAt, {
    message: 'Bitiş tarihi yayın tarihinden sonra olmalı',
  });

export type TargetingInput = z.infer<typeof targetingSchema>;
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;
