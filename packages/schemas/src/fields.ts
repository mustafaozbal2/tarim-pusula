import { z } from 'zod';

/** Konum belirleme yolları (PLAN ek): Tarladayım · Köyümü seçeyim · Haritada göstereyim · Yakınım yapsın. */
export const locationSourceSchema = z.enum(['gps', 'koy', 'harita', 'yakin']);
export type LocationSource = z.infer<typeof locationSourceSchema>;

const lonSchema = z.number().min(-180).max(180);
const latSchema = z.number().min(-90).max(90);

/** GeoJSON Polygon (tek dış halka). Sınır isteğe bağlıdır; nokta konum yeterlidir. */
export const boundarySchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(
      z
        .array(z.tuple([lonSchema, latSchema]))
        .min(4, 'Sınır en az 3 köşe içermeli')
        .max(500),
    )
    .length(1, 'Yalnız dış sınır çizilebilir'),
});
export type Boundary = z.infer<typeof boundarySchema>;

const text = (max: number) => z.string().trim().min(1).max(max);

const fieldBase = z.object({
  name: text(80),
  province: text(60).optional(),
  district: text(60).optional(),
  village: text(60).optional(),
  /** Nokta konum zorunlu. */
  lat: latSchema,
  lon: lonSchema,
  /** Elle girilen alan; sınır varsa sunucu sınırdan hesaplar ve bunu yok sayar. */
  areaDecare: z.number().positive().max(1_000_000).optional(),
  boundary: boundarySchema.optional(),
  /** Ada / parsel numarası (isteğe bağlı; resmî kayıtla eşleştirilmez). */
  parcelBlock: text(20).optional(),
  parcelNo: text(20).optional(),
  cropId: text(60).optional(),
  locationSource: locationSourceSchema.optional(),
  /** İstemcinin ürettiği kimlik: çevrimdışı sıradan tekrar gönderimde çift kayıt olmaz. */
  clientId: z.uuid().optional(),
});

export const fieldCreateSchema = fieldBase;
export const fieldUpdateSchema = fieldBase
  .omit({ clientId: true })
  .partial()
  .extend({ boundary: boundarySchema.nullable().optional() });

export type FieldCreate = z.infer<typeof fieldCreateSchema>;
export type FieldUpdate = z.infer<typeof fieldUpdateSchema>;

/** Yakınım yapsın: çiftçi 24 saat geçerli 6 haneli kod üretir. */
export const NEARBY_CODE_TTL_HOURS = 24;
export const nearbyCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, ''))
  .refine((v) => /^\d{6}$/.test(v), { message: 'Kod 6 haneli olmalı' });

export const nearbyClaimSchema = z.object({
  code: nearbyCodeSchema,
  field: fieldCreateSchema,
});

export const nearbyDecisionSchema = z.object({ approve: z.boolean() });

/** Uygulamada seçilebilir yaygın ürünler (büyük kutu). Sıra = ekrandaki sıra. */
export const COMMON_CROP_IDS = [
  'antep-fistigi',
  'zeytin',
  'bugday',
  'pamuk',
  'domates',
  'arpa',
] as const;
