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
