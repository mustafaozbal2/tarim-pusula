import { describe, expect, it } from 'vitest';
import { canDriveAdvice, needsDraftBadge } from './review';

describe('uzman onayı kuralı', () => {
  it('taslak bilgi öneri üretmez, rozet ister', () => {
    expect(canDriveAdvice('taslak-uzman-onayi-bekliyor')).toBe(false);
    expect(needsDraftBadge('taslak-uzman-onayi-bekliyor')).toBe(true);
  });
  it('onaylı bilgi öneri üretebilir', () => {
    expect(canDriveAdvice('uzman-onayli')).toBe(true);
    expect(needsDraftBadge('uzman-onayli')).toBe(false);
  });
});
