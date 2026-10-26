import { describe, expect, it } from 'vitest';
import { savingsQuery } from './query';

describe('tasarruf raporu sorgusu', () => {
  it('dönem ve toprak her zaman gider', () => {
    expect(savingsQuery({ days: 30, soil: 'tinli' })).toBe('days=30&soil=tinli');
  });
  it('çiftçinin sulaması ikisi de doluysa eklenir (virgüllü ondalık)', () => {
    const q = new URLSearchParams(
      savingsQuery({ days: 60, soil: 'killi', intervalDays: '7', depthMm: '35,5' }),
    );
    expect(q.get('intervalDays')).toBe('7');
    expect(q.get('depthMm')).toBe('35.5');
  });
  it('yarım ya da geçersiz giriş yok sayılır (varsayım kullanılır)', () => {
    expect(savingsQuery({ days: 30, soil: 'tinli', intervalDays: '7' })).not.toContain('interval');
    expect(
      savingsQuery({ days: 30, soil: 'tinli', intervalDays: 'x', depthMm: '3' }),
    ).not.toContain('interval');
  });
});
