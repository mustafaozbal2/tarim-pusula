import { describe, expect, it } from 'vitest';
import { clampValveMinutes, MAX_VALVE_MINUTES } from './index';

describe('cihazda azami vana süresi', () => {
  it('30 dakikayı aşamaz', () => {
    expect(clampValveMinutes(120)).toBe(MAX_VALVE_MINUTES);
    expect(clampValveMinutes(10)).toBe(10);
  });
  it('geçersiz süre 0 olur', () => {
    expect(clampValveMinutes(-5)).toBe(0);
    expect(clampValveMinutes(NaN)).toBe(0);
  });
});
