import type { FieldCreate } from '@tarim/schemas';
import type { Api, FieldDto } from '../api/client';
import { locateOnce, type LocationProvider } from '../location/gps';
import type { KV } from '../offline/kv';
import type { OfflineQueue } from '../offline/queue';
import { exportableEvents } from '../calendar/export';
import { rangeText } from '../calendar/model';
import { FIELDS_CACHE, SELECTED } from '../today/load';
import { weatherText } from '../today/model';
import type { Ortam } from './sohbet';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

/**
 * Sohbet motorunun gerçek ortamı: API, çevrimdışı kuyruk, konum ve seçili tarla. Çiftçi bunların hiçbirini
 * görmez; ekranda yalnız sohbet kartı vardır. Yeni araziyi kaydedince seçili tarla o olur.
 */
export function gercekOrtam(d: {
  api: Pick<
    Api,
    'provinces' | 'districts' | 'villages' | 'crops' | 'fields' | 'today' | 'calendar' | 'pusulaAsk'
  >;
  kv: KV;
  queue: Pick<OfflineQueue, 'enqueue' | 'flush'>;
  konum: LocationProvider;
}): Ortam {
  const secili = async (): Promise<FieldDto | null> => {
    let alanlar: FieldDto[];
    try {
      alanlar = await d.api.fields();
      await d.kv.set(
        FIELDS_CACHE,
        JSON.stringify({ at: new Date().toISOString(), fields: alanlar }),
      );
    } catch {
      const raw = await d.kv.get(FIELDS_CACHE);
      alanlar = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
    }
    const id = await d.kv.get(SELECTED);
    return alanlar.find((f) => f.id === id) ?? alanlar[0] ?? null;
  };
  return {
    async konumAl() {
      const r = await locateOnce(d.konum);
      return r.ok ? { lat: r.lat, lon: r.lon } : null;
    },
    iller: () => d.api.provinces(),
    ilceler: (il) => d.api.districts(il),
    koyler: (il, ilce, ara) => d.api.villages(il, ilce, ara),
    urunler: () => d.api.crops(),
    async kaydet(p: FieldCreate) {
      const id = uuid();
      await d.queue.enqueue({
        id,
        kind: 'field',
        payload: { ...p, clientId: id },
        queuedAt: new Date().toISOString(),
      });
      const out = await d.queue.flush();
      const mine = out.find((o) => o.id === id);
      if (mine?.result === 'rejected') return { durum: 'reddedildi', mesaj: mine.message };
      if (mine?.result === 'sent') {
        // Yeni arazi seçili olsun: ana sayfa ve diğer ekranlar onu göstersin.
        try {
          const yeni = (await d.api.fields()).find((f) => f.name === p.name && f.lat === p.lat);
          if (yeni) await d.kv.set(SELECTED, yeni.id);
        } catch {
          // Seçim sonra yapılır; arazi zaten kayıtlı.
        }
        return { durum: 'gonderildi', id };
      }
      return { durum: 'sirada', id };
    },
    async tarlalar() {
      let alanlar: FieldDto[];
      try {
        alanlar = await d.api.fields();
      } catch {
        const raw = await d.kv.get(FIELDS_CACHE);
        alanlar = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
      }
      return alanlar.map((f) => ({ id: f.id, name: f.name, il: f.province, ilce: f.district }));
    },
    async bugun() {
      const f = await secili();
      if (!f) return null;
      const t = await d.api.today(f.id);
      const w = t.weather;
      const now = w.current ? `${Math.round(w.current.tempC)}°` : null;
      const ozet = `${f.name}: ${weatherText(w.current?.weatherCode).toLowerCase()}${now ? `, şu an ${now}` : ''}. Bugün en düşük ${Math.round(w.today.tMinC)}°, en yüksek ${Math.round(w.today.tMaxC)}°.`;
      const don = t.frost.outlook?.find((x) => x.level === 'warning');
      return don
        ? `${ozet} Dikkat: ${don.dayOffset <= 0 ? 'bu sabah' : don.dayOffset === 1 ? 'yarın sabah' : `${don.dayOffset} gün sonra`} don bekleniyor.`
        : ozet;
    },
    async takvim() {
      const f = await secili();
      if (!f) return [];
      const c = await d.api.calendar(f.id, 60);
      return exportableEvents(c.events)
        .slice(0, 4)
        .map((e) => `${e.title} (${rangeText(e)})`);
    },
    async sor(soru) {
      const f = await secili();
      const r = await d.api.pusulaAsk({ question: soru, ...(f ? { fieldId: f.id } : {}) });
      return r.card;
    },
    async urunKimligi() {
      return (await secili())?.cropId ?? null;
    },
  };
}
