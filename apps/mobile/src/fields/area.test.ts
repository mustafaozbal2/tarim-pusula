import { describe, expect, it } from 'vitest';
import { parseArea } from './area';

describe('arazi büyüklüğü girişi', () => {
  it('virgül ve nokta ondalık kabul edilir', () => {
    expect(parseArea('12,5')).toBe(12.5);
    expect(parseArea(' 40 ')).toBe(40);
    expect(parseArea('3.25')).toBe(3.25);
  });
  it('boş -> null (değişmez), geçersiz -> undefined', () => {
    expect(parseArea('')).toBeNull();
    expect(parseArea('abc')).toBeUndefined();
    expect(parseArea('-3')).toBeUndefined();
    expect(parseArea('0')).toBeUndefined();
  });
});
