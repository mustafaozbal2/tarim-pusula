import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_PREFS } from '@tarim/agro-core';
import type { RemindersDto } from '../api/client';
import { MemoryKV } from '../offline/kv';
import { FIELDS_CACHE, SELECTED } from '../today/load';
import {
  checkReminders,
  loadHistory,
  loadReminderPrefs,
  reasonText,
  reminderQuery,
  saveReminderPrefs,
} from './run';

// 10:00 yerel = 07:00 UTC
const NOW = new Date('2026-07-10T07:00:00Z');

const due = (type: 'nem-esigi' | 'gunluk-sulama') => ({
  kind: 'due' as const,
  type,
  title: type === 'nem-esigi' ? 'Nem düşük' : 'Sulama gerekiyor',
  body: 'gövde',
  why: [],
});
const none = (reason: string) => ({ kind: 'none' as const, reason });

function dto(over: Partial<RemindersDto> = {}): RemindersDto {
  return {
    fieldId: 'f1',
    generatedAt: NOW.toISOString(),
    hasSensor: true,
    daily: none('ihtiyac-yok'),
    moisture: none('esik-ustunde'),
    basis: null,
    ...over,
  };
}

async function setup(r: RemindersDto | Error) {
  const kv = new MemoryKV();
  await kv.set(FIELDS_CACHE, JSON.stringify({ fields: [{ id: 'f1', lat: 37 }] }));
  await kv.set(SELECTED, 'f1');
  const sent: { title: string; body: string }[] = [];
  const api = {
    reminders: async () => {
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { kv, api, sent, notify: async (n: { title: string; body: string }) => void sent.push(n) };
}

describe('hatırlatıcı denetimi', () => {
  it('karar yoksa bildirim yok', async () => {
    const s = await setup(dto());
    const r = await checkReminders(s.api, s.kv, NOW, s.notify);
    expect(r.sent).toEqual([]);
    expect(s.sent).toEqual([]);
  });

  it('nem ve günlük ihtiyaç birlikte: iki bildirim gider ve geçmişe yazılır', async () => {
    const s = await setup(dto({ moisture: due('nem-esigi'), daily: due('gunluk-sulama') }));
    const r = await checkReminders(s.api, s.kv, NOW, s.notify);
    expect(r.sent.map((x) => x.type)).toEqual(['nem-esigi', 'gunluk-sulama']);
    expect(s.sent).toHaveLength(2);
    expect(await loadHistory(s.kv)).toHaveLength(2);
  });

  it('ikinci denetimde (aynı saat) tekrar bildirim gitmez: sınır', async () => {
    const s = await setup(dto({ moisture: due('nem-esigi'), daily: due('gunluk-sulama') }));
    await checkReminders(s.api, s.kv, NOW, s.notify);
    const again = await checkReminders(s.api, s.kv, new Date(NOW.getTime() + 60_000), s.notify);
    expect(again.sent).toEqual([]);
    expect(again.held.map((h) => h.reason)).toEqual(['sinir', 'sinir']);
    expect(s.sent).toHaveLength(2);
  });

  it('sessiz saatte (23:00 yerel) hiçbir bildirim gitmez, ertelenir', async () => {
    const s = await setup(dto({ moisture: due('nem-esigi') }));
    const night = new Date('2026-07-10T20:00:00Z'); // 23:00 yerel
    const r = await checkReminders(s.api, s.kv, night, s.notify);
    expect(r.sent).toEqual([]);
    expect(r.held).toEqual([{ type: 'nem-esigi', reason: 'sessiz-saat' }]);
    expect(await loadHistory(s.kv)).toEqual([]); // ertelenen kayda geçmez: sabah yeniden bakılır
  });

  it('nem hatırlatıcısı 6 saat dolunca yeniden gönderilebilir', async () => {
    const s = await setup(dto({ moisture: due('nem-esigi') }));
    await checkReminders(s.api, s.kv, NOW, s.notify);
    const later = new Date(NOW.getTime() + 6 * 3_600_000);
    const r = await checkReminders(s.api, s.kv, later, s.notify);
    expect(r.sent).toHaveLength(1);
  });

  it('günlük sınır: kullanıcı günde en çok 1 ayarlarsa ikincisi gitmez', async () => {
    const s = await setup(dto({ moisture: due('nem-esigi'), daily: due('gunluk-sulama') }));
    await saveReminderPrefs(s.kv, { ...DEFAULT_REMINDER_PREFS, maxPerDay: 1 });
    const r = await checkReminders(s.api, s.kv, NOW, s.notify);
    expect(r.sent).toHaveLength(1);
    expect(r.held).toEqual([{ type: 'gunluk-sulama', reason: 'sinir' }]);
  });

  it('çevrimdışı ya da sunucu hatası: error, bildirim yok', async () => {
    const s = await setup(new Error('offline'));
    const r = await checkReminders(s.api, s.kv, NOW, s.notify);
    expect(r.error).toBe(true);
    expect(r.sent).toEqual([]);
  });

  it('arazi yoksa sessizce çıkar', async () => {
    const kv = new MemoryKV();
    const r = await checkReminders(
      { reminders: async () => dto() },
      kv,
      NOW,
      async () => undefined,
    );
    expect(r.fieldId).toBeNull();
  });
});

describe('ayarlar ve sorgu', () => {
  it('kayıt yoksa varsayılan; geçersiz değerler temizlenir ve kalıcıdır', async () => {
    const kv = new MemoryKV();
    expect(await loadReminderPrefs(kv)).toEqual(DEFAULT_REMINDER_PREFS);
    await saveReminderPrefs(kv, { dailyHour: 30, moistureThreshold: 0.2 } as never);
    const p = await loadReminderPrefs(kv);
    expect(p.dailyHour).toBe(7);
    expect(p.moistureThreshold).toBe(0.2);
  });
  it('sorgu eşik, saat ve aç/kapa değerlerini taşır', () => {
    expect(
      reminderQuery({ ...DEFAULT_REMINDER_PREFS, moistureThreshold: 0.18, dailyHour: 6 }),
    ).toBe('moistureThreshold=0.18&dailyHour=6&moistureEnabled=1&dailyEnabled=1');
    expect(reminderQuery({ ...DEFAULT_REMINDER_PREFS, moistureEnabled: false })).toContain(
      'moistureEnabled=0',
    );
  });
  it('sensör yoksa metin "cihaz ekleyince açılır"', () => {
    expect(reasonText('cihaz-yok')).toBe('Cihaz ekleyince açılır.');
    expect(reasonText('onaysiz-veri')).not.toMatch(/onayı bekl/i);
  });
});
