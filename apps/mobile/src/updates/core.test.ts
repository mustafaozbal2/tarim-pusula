import { describe, expect, it } from 'vitest';
import { RESUME_CHECK_MS, shouldCheckOnResume, syncUpdate, type UpdatesApi } from './core';

function fake(o: Partial<UpdatesApi> & { available?: boolean; isNew?: boolean; fail?: boolean }) {
  const calls: string[] = [];
  const api: UpdatesApi = {
    enabled: o.enabled ?? true,
    check: async () => {
      calls.push('check');
      if (o.fail) throw new Error('ağ yok');
      return { isAvailable: o.available ?? false };
    },
    fetch: async () => {
      calls.push('fetch');
      return { isNew: o.isNew ?? true };
    },
    reload: async () => {
      calls.push('reload');
    },
  };
  return { api, calls };
}

describe('uygulama içi güncelleme', () => {
  it('yeni sürüm varsa indirir ve hemen yeniden açar (iki kez kapat-aç gerekmez)', async () => {
    const f = fake({ available: true });
    expect(await syncUpdate(f.api)).toBe('yeniden-aciliyor');
    expect(f.calls).toEqual(['check', 'fetch', 'reload']);
  });

  it('güncelse indirmez, yeniden açmaz', async () => {
    const f = fake({ available: false });
    expect(await syncUpdate(f.api)).toBe('guncel');
    expect(f.calls).toEqual(['check']);
  });

  it('indirilen sürüm yeni değilse yeniden açmaz', async () => {
    const f = fake({ available: true, isNew: false });
    expect(await syncUpdate(f.api)).toBe('guncel');
    expect(f.calls).not.toContain('reload');
  });

  it('ağ hatası uygulamayı bozmaz; web ve geliştirmede kapalı', async () => {
    expect(await syncUpdate(fake({ fail: true }).api)).toBe('hata');
    const off = fake({ enabled: false, available: true });
    expect(await syncUpdate(off.api)).toBe('kapali');
    expect(off.calls).toEqual([]);
  });

  it('öne gelişte en sık dakikada bir denetler', () => {
    expect(shouldCheckOnResume(null, 0)).toBe(true);
    expect(shouldCheckOnResume(1000, 1000 + RESUME_CHECK_MS - 1)).toBe(false);
    expect(shouldCheckOnResume(1000, 1000 + RESUME_CHECK_MS)).toBe(true);
  });
});
