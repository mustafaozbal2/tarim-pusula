import { z } from 'zod';

export const reviewStatusSchema = z.enum(['taslak-uzman-onayi-bekliyor', 'uzman-onayli']);

/** Her veri kaynağı için kaynak + tarih + sürüm saklanır (değişmez kural 6). */
export const sourceRefSchema = z.object({
  source: z.string().min(1),
  retrievedAt: z.iso.datetime(),
  version: z.string().min(1),
});

export const kcRecordSchema = z.object({
  cropTr: z.string().min(1),
  cropFao: z.string().min(1),
  kcIni: z.number().positive(),
  kcMid: z.number().positive(),
  kcEnd: z.number().positive(),
  reviewStatus: reviewStatusSchema,
  source: sourceRefSchema,
});

export type SourceRef = z.infer<typeof sourceRefSchema>;
export type KcRecord = z.infer<typeof kcRecordSchema>;
export * from './auth';
export * from './fields';
export * from './announcements';
export * from './panel';
