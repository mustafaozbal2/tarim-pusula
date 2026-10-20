import { z } from 'zod';

export const roleSchema = z.enum([
  'farmer',
  'assistant',
  'cooperative',
  'advisor',
  'institution_admin',
  'expert',
  'admin',
]);
export type Role = z.infer<typeof roleSchema>;

/**
 * Türkiye cep telefonu. "0532 123 45 67", "5321234567", "905321234567" ve "+905321234567"
 * kabul edilir; çıktı her zaman "+905321234567" biçimindedir. Başka hiçbir kimlik verisi
 * (TC kimlik no dahil) toplanmaz.
 */
export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .transform((v) => v.replace(/^\+?90/, '').replace(/^0/, ''))
  .refine((v) => /^5\d{9}$/.test(v), { message: 'Geçerli bir cep telefonu numarası yazın' })
  .transform((v) => `+90${v}`);

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Kod 6 haneli olmalı'),
});

export const fieldLevelSchema = z.enum(['read', 'write']);

export const fieldAccessGrantSchema = z.object({
  userId: z.uuid(),
  level: fieldLevelSchema,
});

export const deviceCreateSchema = z.object({
  fieldId: z.uuid(),
  name: z.string().trim().min(1).max(80),
});

export const consentPurposeSchema = z.enum([
  'kullanim-sartlari',
  'konum-isleme',
  'bildirim',
  'kurumla-paylasim',
]);
export const consentCreateSchema = z.object({
  purpose: consentPurposeSchema,
  granted: z.boolean(),
  policyVersion: z.string().min(1).max(40),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).nullable(),
});

export const accountDeleteSchema = z.object({ confirm: z.literal('SIL') });
export const roleGrantSchema = z.object({ role: roleSchema });
