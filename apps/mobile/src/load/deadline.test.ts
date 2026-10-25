import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeadlineError, LOAD_DEADLINE_MS, withDeadline } from './deadline';

describe('withDeadline: yükleme en geç 10 sn', () => {
  afterEach(() => vi.useRealTimers());
  it('süre 10 sn', () => {
    expect(LOAD_DEADLINE_MS).toBe(10_000);
  });
  it('zamanında biten iş sonucunu döndürür', async () => {
    await expect(withDeadline(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it('hiç bitmeyen iş süre dolunca DeadlineError verir', async () => {
    vi.useFakeTimers();
    const p = withDeadline(new Promise<number>(() => {}));
    const check = expect(p).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(LOAD_DEADLINE_MS);
    await check;
  });
  it('işin kendi hatası aynen geçer', async () => {
    await expect(withDeadline(Promise.reject(new Error('x')), 50)).rejects.toThrow('x');
  });
});
