import { describe, expect, it } from 'vitest';
import {
  RESUME_CHECK_MS,
  checkApk,
  compareVersions,
  prefetchUpdate,
  shouldCheckOnResume,
  syncUpdate,
  type UpdatesApi,
} from './core';

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

describe('arka plan güncellemesi (açılışta bekletmez)', () => {
  it('sessizce indirir, yeniden AÇMAZ; yeni sürüm indiyse "hazır" der (şerit çıkar)', async () => {
    const f = fake({ available: true });
    expect(await prefetchUpdate(f.api)).toBe(true);
    expect(f.calls).toEqual(['check', 'fetch']);
    const g = fake({ available: false });
    expect(await prefetchUpdate(g.api)).toBe(false);
    expect(g.calls).toEqual(['check']);
    expect(await prefetchUpdate(fake({ available: true, isNew: false }).api)).toBe(false);
  });

  it('ağ hatası ve kapalı sürümde şerit çıkmaz, uygulama bozulmaz', async () => {
    expect(await prefetchUpdate(fake({ fail: true }).api)).toBe(false);
    const off = fake({ enabled: false, available: true });
    expect(await prefetchUpdate(off.api)).toBe(false);
    expect(off.calls).toEqual([]);
  });
});

describe('APK sürüm kapısı (yerel kod değişince)', () => {
  const m = (enAz: string) => async () => ({
    enAz,
    son: enAz,
    adres: 'https://tarimpusula.onrender.com/tarim-pusula.apk',
  });

  it('sürüm karşılaştırma', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('0.10.0', '0.9.5')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('abc', '0.0.0')).toBe(0);
  });

  it('yüklü APK en azın altındaysa zorunlu; eşit ya da üstündeyse değil', async () => {
    expect((await checkApk('0.1.0', m('0.2.0'))).kind).toBe('zorunlu');
    expect((await checkApk('0.2.0', m('0.2.0'))).kind).toBe('tamam');
    expect((await checkApk('0.3.0', m('0.2.0'))).kind).toBe('tamam');
  });

  it('dosya okunamazsa, bozuksa ya da adres https değilse giriş engellenmez', async () => {
    const hata = async () => {
      throw new Error('ağ yok');
    };
    expect((await checkApk('0.1.0', hata)).kind).toBe('tamam');
    const bozuk = (async () => ({ foo: 1 })) as never;
    expect((await checkApk('0.1.0', bozuk)).kind).toBe('tamam');
    const http = async () => ({ enAz: '9.0.0', son: '9.0.0', adres: 'http://kotu.example/a.apk' });
    expect((await checkApk('0.1.0', http)).kind).toBe('tamam');
    const yavas = () => new Promise<never>(() => undefined);
    expect((await checkApk('0.1.0', yavas, 20)).kind).toBe('tamam');
  });
});
