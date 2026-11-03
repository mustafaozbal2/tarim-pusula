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

/** Expo push belirteci (ExponentPushToken[...]) ve platformu. */
export const pushTokenSchema = z.object({
  token: z.string().min(10).max(200),
  platform: z.enum(['ios', 'android', 'web']),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;

/**
 * G24 şifre: en az 8 karakter, en az bir harf ve bir rakam. Sunucuda scrypt özeti saklanır.
 * Üst sınır 72: uzun girdiyle hesap yükünü sınırlar.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı')
  .max(72, 'Şifre en çok 72 karakter olabilir')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), {
    message: 'Şifrede en az bir harf ve bir rakam olmalı',
  });

const otpCode = z.string().regex(/^\d{6}$/, 'Kod 6 haneli olmalı');
const personName = z.string().trim().min(2, 'Adınızı yazın').max(80);

/** Çiftçi kaydı: telefon + SMS kodu + şifre (+ ad). KVKK onayı istemcide zorunlu, sunucuda da. */
export const registerSchema = z.object({
  phone: phoneSchema,
  code: otpCode,
  password: passwordSchema,
  name: personName.optional(),
  kvkk: z.literal(true, { message: 'KVKK aydınlatma metnini onaylayın' }),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Şifreni yaz').max(72),
});

export const passwordResetSchema = z.object({
  phone: phoneSchema,
  code: otpCode,
  password: passwordSchema,
});

export const institutionSchema = z.enum([
  'bakanlik',
  'il_mudurlugu',
  'ilce_mudurlugu',
  'belediye',
  'ziraat_odasi',
  'kooperatif',
  'universite',
  'arastirma_enstitusu',
  'danismanlik',
]);

/**
 * Yetkili başvurusu. Sicil/yetki numarası kurum içi numaradır; 11 haneli sayı (TC kimlik no olabilir)
 * kabul edilmez (KVKK veri minimizasyonu, değişmez kural 4).
 */
export const staffRegisterSchema = z
  .object({
    phone: phoneSchema,
    code: otpCode,
    password: passwordSchema,
    name: personName,
    institution: institutionSchema,
    institutionName: z.string().trim().min(2).max(160),
    province: z.string().trim().min(2).max(40).optional(),
    district: z.string().trim().min(2).max(40).optional(),
    title: z.string().trim().min(2).max(80),
    registryNo: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .refine((v) => !/^\d{11}$/.test(v.replace(/\s/g, '')), {
        message: 'TC kimlik numarası yazmayın; kurum sicil/yetki numaranızı yazın',
      }),
    expertise: z
      .array(z.string().regex(/^[a-z0-9-]+$/))
      .max(20)
      .default([]),
    wantsRole: z.enum(['expert', 'institution_admin']).default('expert'),
    kvkk: z.literal(true, { message: 'KVKK aydınlatma metnini onaylayın' }),
  })
  .refine((s) => s.institution === 'bakanlik' || !!s.province, {
    message: 'İl seçin',
    path: ['province'],
  })
  .refine((s) => !['ilce_mudurlugu', 'belediye'].includes(s.institution) || !!s.district, {
    message: 'İlçe seçin',
    path: ['district'],
  });

/** Yetkili ikinci adım: SMS kodu (oturuma iki adımlı doğrulama işareti). */
export const smsMfaSchema = z.object({ code: otpCode });

export const staffDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

export type StaffRegister = z.infer<typeof staffRegisterSchema>;
