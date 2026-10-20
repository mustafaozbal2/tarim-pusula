import { describe, expect, it } from 'vitest';
import { ApiError, createApi, NetworkError } from './api/client';
import {
  centroid,
  defaultFieldName,
  emptyDraft,
  movedOnMap,
  problems,
  toFieldPayload,
  withPoint,
} from './flow/draft';
import { locateOnce, type LocationProvider } from './location/gps';
import { clampZoom, satelliteStyle, zoomFor } from './location/mapStyle';
import { MemoryKV } from './offline/kv';
import { OfflineQueue, type QueueItem } from './offline/queue';

const CLIENT = '5b0f2b0e-7c37-4a3a-9d55-5d3d6d6b9a10';
const payload = { name: 'Bahçe', lat: 37.06, lon: 37.38 };

function fakeApi(script: (kind: string) => 'ok' | 'offline' | number) {
  const calls: string[] = [];
  const act = (kind: string) => {
    calls.push(kind);
    const r = script(kind);
    if (r === 'offline') throw new NetworkError();
    if (typeof r === 'number') throw new ApiError(r, 'red');
    return Promise.resolve({ id: 'x', proposalId: 'y' } as never);
  };
  return {
    calls,
    api: {
      createField: async () => act('field'),
      nearbyClaim: async () => act('claim'),
    },
  };
}

const item = (id: string, kind: 'field' | 'claim' = 'field'): QueueItem =>
  kind === 'field'
    ? { id, kind, payload, queuedAt: 't' }
    : { id, kind, code: '482913', payload, queuedAt: 't' };

describe('çevrimdışı sıra', () => {
  it('bağlantı yokken sırada kalır, bağlantı gelince gönderilir', async () => {
    const kv = new MemoryKV();
    let online = false;
    const { api, calls } = fakeApi(() => (online ? 'ok' : 'offline'));
    const q = new OfflineQueue(kv, api);
    await q.enqueue(item(CLIENT));
    expect(await q.flush()).toEqual([{ id: CLIENT, result: 'offline' }]);
    expect(await q.pending()).toHaveLength(1);

    // uygulama yeniden açılsa da sıra durur (aynı depo)
    const reopened = new OfflineQueue(kv, api);
    expect(await reopened.pending()).toHaveLength(1);

    online = true;
    expect(await reopened.flush()).toEqual([{ id: CLIENT, result: 'sent' }]);
    expect(await reopened.pending()).toEqual([]);
    expect(calls).toEqual(['field', 'field']);
  });

  it('sıra korunur; ilk bağlantı hatasında durur', async () => {
    const { api, calls } = fakeApi(() => (calls.length > 2 ? 'offline' : 'ok'));
    const q = new OfflineQueue(new MemoryKV(), api);
    for (const id of ['a', 'b', 'c']) await q.enqueue(item(id));
    const out = await q.flush();
    expect(out.map((o) => o.result)).toEqual(['sent', 'sent', 'offline']);
    expect((await q.pending()).map((i) => i.id)).toEqual(['c']);
  });

  it('sunucu kalıcı reddederse (yanlış kod) sıradan çıkar ve haber verilir', async () => {
    const { api } = fakeApi((k) => (k === 'claim' ? 404 : 'ok'));
    const q = new OfflineQueue(new MemoryKV(), api);
    await q.enqueue(item('k', 'claim'));
    await q.enqueue(item('f'));
    const out = await q.flush();
    expect(out[0]).toMatchObject({ id: 'k', result: 'rejected', status: 404 });
    expect(out[1]).toMatchObject({ id: 'f', result: 'sent' });
    expect(await q.pending()).toEqual([]);
  });

  it('5xx geçicidir: sırada kalır', async () => {
    const { api } = fakeApi(() => 503);
    const q = new OfflineQueue(new MemoryKV(), api);
    await q.enqueue(item('a'));
    expect((await q.flush())[0]!.result).toBe('offline');
    expect(await q.pending()).toHaveLength(1);
  });

  it('aynı kimlik iki kez eklenmez; eşzamanlı flush tek çalışır', async () => {
    const { api, calls } = fakeApi(() => 'ok');
    const q = new OfflineQueue(new MemoryKV(), api);
    await q.enqueue(item('a'));
    await q.enqueue(item('a'));
    const [x, y] = await Promise.all([q.flush(), q.flush()]);
    expect(x).toEqual(y);
    expect(calls).toEqual(['field']);
  });

  it('tarla gönderilirken clientId olarak sıra kimliği kullanılır (çift kayıt olmaz)', async () => {
    let seen: unknown;
    const q = new OfflineQueue(new MemoryKV(), {
      createField: async (f) => {
        seen = f;
        return {} as never;
      },
      nearbyClaim: async () => ({}) as never,
    });
    await q.enqueue(item(CLIENT));
    await q.flush();
    expect(seen).toMatchObject({ clientId: CLIENT });
  });
});

describe('tarla taslağı', () => {
  it('dört konum yolu da aynı yükü üretir', () => {
    const place = { province: 'Gaziantep', district: 'Nizip', village: 'Burç' };
    const base = { ...emptyDraft(), cropId: 'antep-fistigi' };
    const gps = withPoint(base, { lat: 37.06, lon: 37.38 }, 'gps');
    const koy = withPoint(base, { lat: 37.07, lon: 37.39 }, 'koy', place);
    const harita = movedOnMap(koy, { lat: 37.071, lon: 37.391 });
    const yakin = withPoint(base, { lat: 37.08, lon: 37.4 }, 'yakin');
    for (const d of [gps, koy, harita, yakin]) {
      const p = toFieldPayload(d);
      expect(p.cropId).toBe('antep-fistigi');
      expect(p.locationSource).toBe(d.source);
    }
    expect(harita.source).toBe('harita');
    expect(toFieldPayload(koy).name).toBe('Burç Bahçesi');
    expect(defaultFieldName(gps)).toBe('Tarlam');
  });

  it('eksik bilgi bildirilir', () => {
    expect(problems(emptyDraft())).toEqual(['konum', 'urun']);
    expect(() => toFieldPayload(emptyDraft())).toThrow(/Eksik/);
    const d = withPoint({ ...emptyDraft(), cropId: 'x' }, { lat: 1, lon: 2 }, 'gps');
    expect(problems({ ...d, name: '  ' })).toEqual(['ad']);
  });

  it('merkez hesabı', () => {
    expect(centroid([])).toBeNull();
    expect(
      centroid([
        { lat: 36, lon: 36 },
        { lat: 38, lon: 38 },
      ]),
    ).toEqual({ lat: 37, lon: 37 });
  });
});

describe('Tarladayım (GPS)', () => {
  const ok: LocationProvider = {
    requestPermission: async () => 'granted',
    currentPosition: async () => ({ lat: 37.06, lon: 37.38, accuracyM: 8 }),
  };
  it('izin verilirse konum döner', async () => {
    expect(await locateOnce(ok)).toEqual({ ok: true, lat: 37.06, lon: 37.38, accuracyM: 8 });
  });
  it('izin reddedilirse köy listesine düşülür', async () => {
    expect(await locateOnce({ ...ok, requestPermission: async () => 'denied' })).toEqual({
      ok: false,
      reason: 'izin-yok',
    });
  });
  it('izin sorgusu hata verirse de düşer', async () => {
    const bad = { ...ok, requestPermission: async () => Promise.reject(new Error('x')) };
    expect((await locateOnce(bad)).ok).toBe(false);
  });
  it('konum alınamazsa düşer', async () => {
    const bad = { ...ok, currentPosition: async () => Promise.reject(new Error('zaman aşımı')) };
    expect(await locateOnce(bad)).toEqual({ ok: false, reason: 'alinamadi' });
    const nan = { ...ok, currentPosition: async () => ({ lat: NaN, lon: 1, accuracyM: null }) };
    expect((await locateOnce(nan)).ok).toBe(false);
  });
});

describe('harita', () => {
  it('uydu altlığı ve atıf stilde bulunur', () => {
    const s = satelliteStyle();
    expect(s.sources['uydu']!.tiles[0]).toContain('{z}');
    expect(s.sources['uydu']!.attribution).toMatch(/Sentinel/);
    expect(satelliteStyle('https://x/{z}/{x}/{y}.png', 'A').sources['uydu']!.attribution).toBe('A');
  });
  it('zoom sınırlanır', () => {
    expect(clampZoom(0)).toBe(4);
    expect(clampZoom(30)).toBe(18);
    expect(clampZoom(12)).toBe(12);
    expect(zoomFor('gps')).toBeGreaterThan(zoomFor('koy'));
  });
});

describe('API istemcisi', () => {
  const mk = (fetchImpl: typeof fetch) =>
    createApi({ baseUrl: 'http://x', getToken: () => 'tok', fetchImpl });
  it('jetonu başlığa koyar, JSON gönderir', async () => {
    let init: RequestInit | undefined;
    const api = mk(async (_u, i) => {
      init = i;
      return new Response('{"id":"1"}', { status: 201 });
    });
    await api.createField(payload);
    expect((init!.headers as Record<string, string>)['authorization']).toBe('Bearer tok');
    expect(JSON.parse(init!.body as string)).toEqual(payload);
  });
  it('ağ hatası NetworkError, sunucu hatası ApiError', async () => {
    await expect(
      mk(async () => Promise.reject(new TypeError('x'))).fields(),
    ).rejects.toBeInstanceOf(NetworkError);
    const err = await mk(async () => new Response('{"message":"Kod geçersiz"}', { status: 404 }))
      .nearbyClaim('111111', payload)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: 'Kod geçersiz' });
  });
  it('il/ilçe adları URL için kodlanır', async () => {
    let url = '';
    await mk(async (u) => {
      url = String(u);
      return new Response('[]');
    }).villages('Şanlıurfa', 'Bozova', 'a b');
    expect(url).toBe(
      'http://x/places/villages?province=%C5%9Eanl%C4%B1urfa&district=Bozova&q=a%20b',
    );
  });
});

describe('sıra bildirimi', () => {
  it('gönderim olunca dinleyiciye haber verilir; çevrimdışıyken verilmez', async () => {
    let online = false;
    const { api } = fakeApi(() => (online ? 'ok' : 'offline'));
    const q = new OfflineQueue(new MemoryKV(), api);
    let n = 0;
    const off = q.subscribe(() => n++);
    await q.enqueue(item('a'));
    await q.flush();
    expect(n).toBe(0);
    online = true;
    await q.flush();
    expect(n).toBe(1);
    off();
    await q.enqueue(item('b'));
    await q.flush();
    expect(n).toBe(1);
  });
});
