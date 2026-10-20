import { z } from 'zod';

/** Veri Cüzdanı paylaşım kategorileri (sabit liste; serbest metin kapsam yok). */
export const SHARE_CATEGORIES = [
  'fields',
  'irrigation',
  'questions',
  'devices',
  'consents',
  'profile',
] as const;
export const shareCategorySchema = z.enum(SHARE_CATEGORIES);
export type ShareCategory = z.infer<typeof shareCategorySchema>;

/** En çok 365 gün; süresiz paylaşım yoktur (KVKK veri minimizasyonu). */
export const MAX_SHARE_DAYS = 365;

export const shareCreateSchema = z.object({
  recipientId: z.uuid(),
  categories: z.array(shareCategorySchema).min(1).max(SHARE_CATEGORIES.length),
  purpose: z.string().trim().min(3).max(200),
  days: z.number().int().min(1).max(MAX_SHARE_DAYS),
});
export type ShareCreate = z.infer<typeof shareCreateSchema>;
