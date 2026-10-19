import { describe, expect, it } from 'vitest';
import { kcRecordSchema, sourceRefSchema } from './index';

describe('şemalar', () => {
  const source = {
    source: 'FAO-56 Table 12',
    retrievedAt: '2026-10-19T00:00:00Z',
    version: '1998',
  };
  it('kaynak kaydı üç alanı da ister', () => {
    expect(sourceRefSchema.safeParse(source).success).toBe(true);
    expect(sourceRefSchema.safeParse({ source: 'x' }).success).toBe(false);
  });
  it('geçersiz onay durumunu reddeder', () => {
    const base = {
      cropTr: 'Arpa',
      cropFao: 'Barley',
      kcIni: 0.3,
      kcMid: 1.15,
      kcEnd: 0.25,
      source,
    };
    expect(
      kcRecordSchema.safeParse({ ...base, reviewStatus: 'taslak-uzman-onayi-bekliyor' }).success,
    ).toBe(true);
    expect(kcRecordSchema.safeParse({ ...base, reviewStatus: 'belki' }).success).toBe(false);
  });
});

import { phoneSchema, otpVerifySchema, fieldCreateSchema } from './index';

describe('telefon ve kimlik şemaları', () => {
  it.each(['0532 123 45 67', '5321234567', '905321234567', '+90 (532) 123-45-67'])(
    '%s normalize edilir',
    (v) => expect(phoneSchema.parse(v)).toBe('+905321234567'),
  );
  it.each(['', '12345', '+905', '02121234567', '+15551234567', '12345678901'])(
    '%s reddedilir (TC kimlik no gibi 11 haneli değerler dahil)',
    (v) => expect(phoneSchema.safeParse(v).success).toBe(false),
  );
  it('OTP kodu 6 hane olmalı', () => {
    expect(otpVerifySchema.safeParse({ phone: '5321234567', code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ phone: '5321234567', code: '123456' }).success).toBe(true);
  });
  it('tarla koordinatı sınırları denetlenir', () => {
    expect(fieldCreateSchema.safeParse({ name: 'A', lat: 91 }).success).toBe(false);
    expect(fieldCreateSchema.safeParse({ name: 'A', lat: 37, lon: 38 }).success).toBe(true);
  });
});
