import type { ReviewStatus } from './review';
import { describe, expect, it } from 'vitest';
import {
  applyLimits,
  criticalMoisture,
  DEFAULT_REMINDER_PREFS,
  effectiveMoistureThreshold,
  evaluateDailyReminder,
  evaluateMoistureReminder,
  isQuietHour,
  sanitizeReminderPrefs,
  trLocal,
  type MoistureInput,
  type ReminderDecision,
  type SentReminder,
} from './reminders';
import { decideIrrigation, type IrrigationDecision } from './waterBalance';

const OK = 'uzman-onayli' as const;
const DRAFT = 'taslak-uzman-onayi-bekliyor' as const;
// 10:00 yerel = 07:00 UTC
const NOW = new Date('2026-07-10T07:00:00Z');

const moisture = (over: Partial<MoistureInput> = {}): MoistureInput => ({
  prefs: DEFAULT_REMINDER_PREFS,
  hasSensor: true,
  reviews: [OK, OK, OK, OK],
  thetaFc: 0.3,
  thetaWp: 0.15,
  p: 0.5,
  latest: { theta: 0.2, at: '2026-07-10T06:00:00Z' },
  now: NOW,
  ...over,
});

describe('kritik nem eşiği (FAO-56)', () => {
  it('θcrit = θFC − p (θFC − θWP): 0,30 − 0,5·0,15 = 0,225', () => {
    expect(criticalMoisture(0.3, 0.15, 0.5)).toBeCloseTo(0.225, 10);
    // p = 0,4 -> 0,30 − 0,4·0,15 = 0,24
    expect(criticalMoisture(0.3, 0.15, 0.4)).toBeCloseTo(0.24, 10);
  });
  it('geçersiz parametre hata verir', () => {
    expect(() => criticalMoisture(0.1, 0.2, 0.5)).toThrow();
    expect(() => criticalMoisture(0.3, 0.1, 1)).toThrow();
  });
  it('kullanıcı eşiği θWP..θFC aralığına sıkıştırılır', () => {
    const p = { moistureThreshold: 0.9 };
    expect(effectiveMoistureThreshold(p, 0.3, 0.15, 0.5)).toBe(0.3);
    expect(effectiveMoistureThreshold({ moistureThreshold: 0.05 }, 0.3, 0.15, 0.5)).toBe(0.15);
    expect(effectiveMoistureThreshold({ moistureThreshold: null }, 0.3, 0.15, 0.5)).toBeCloseTo(
      0.225,
      10,
    );
  });
});

describe('(a) toprak nemi hatırlatıcısı', () => {
  it('eşiğin altı (0,20 < 0,225) hatırlatır', () => {
    const d = evaluateMoistureReminder(moisture());
    expect(d.kind).toBe('due');
    if (d.kind === 'due') {
      expect(d.type).toBe('nem-esigi');
      expect(d.body).toContain('%20');
      expect(d.body).toContain('%22,5');
    }
  });
  it('tam eşikte hatırlatmaz (kesin küçüktür), eşiğin üstünde de hatırlatmaz', () => {
    expect(
      evaluateMoistureReminder(moisture({ latest: { theta: 0.225, at: '2026-07-10T06:00:00Z' } })),
    ).toEqual({
      kind: 'none',
      reason: 'esik-ustunde',
    });
    expect(
      evaluateMoistureReminder(moisture({ latest: { theta: 0.25, at: '2026-07-10T06:00:00Z' } }))
        .kind,
    ).toBe('none');
  });
  it('kullanıcı eşiğini kullanır', () => {
    const d = evaluateMoistureReminder(
      moisture({
        prefs: { ...DEFAULT_REMINDER_PREFS, moistureThreshold: 0.19 },
        latest: { theta: 0.2, at: '2026-07-10T06:00:00Z' },
      }),
    );
    expect(d).toEqual({ kind: 'none', reason: 'esik-ustunde' });
  });
  it('sensör yoksa "cihaz-yok"; kapalıysa "kapali"', () => {
    expect(evaluateMoistureReminder(moisture({ hasSensor: false }))).toEqual({
      kind: 'none',
      reason: 'cihaz-yok',
    });
    expect(
      evaluateMoistureReminder(
        moisture({ prefs: { ...DEFAULT_REMINDER_PREFS, moistureEnabled: false } }),
      ),
    ).toEqual({ kind: 'none', reason: 'kapali' });
  });
  it('onaysız Kc/toprak/kök/p tek başına bile hatırlatıcıyı keser', () => {
    for (let k = 0; k < 4; k++) {
      const reviews: ReviewStatus[] = [OK, OK, OK, OK];
      reviews[k] = DRAFT;
      expect(evaluateMoistureReminder(moisture({ reviews }))).toEqual({
        kind: 'none',
        reason: 'onaysiz-veri',
      });
    }
  });
  it('ölçüm yoksa ya da 6 saatten eskiyse karar verilmez; tam 6 saat kabul', () => {
    expect(evaluateMoistureReminder(moisture({ latest: null }))).toEqual({
      kind: 'none',
      reason: 'veri-yok',
    });
    expect(
      evaluateMoistureReminder(moisture({ latest: { theta: 0.1, at: '2026-07-10T00:59:00Z' } })),
    ).toEqual({ kind: 'none', reason: 'veri-eski' });
    expect(
      evaluateMoistureReminder(moisture({ latest: { theta: 0.1, at: '2026-07-10T01:00:00Z' } }))
        .kind,
    ).toBe('due');
    // gelecekteki zaman damgası güvenilmez
    expect(
      evaluateMoistureReminder(moisture({ latest: { theta: 0.1, at: '2026-07-10T09:00:00Z' } })),
    ).toEqual({ kind: 'none', reason: 'veri-eski' });
  });
});

describe('(b) günlük sulama ihtiyacı (FAO-56 su dengesi)', () => {
  const approved = (drYesterday: number | null): IrrigationDecision =>
    decideIrrigation({
      kc: { value: 1, reviewStatus: OK },
      soil: { thetaFc: 0.3, thetaWp: 0.1, reviewStatus: OK },
      rootDepth: { valueM: 0.5, reviewStatus: OK },
      p: { value: 0.5, reviewStatus: OK },
      drYesterday,
      et0: 5,
      forecastRainMm: 0,
    });
  it('TAW=100, RAW=50 (p=0,5, ETc=5): Dr=50 ise sula; hatırlatıcı net 50 mm ve m³ yazar', () => {
    const d = evaluateDailyReminder({
      prefs: DEFAULT_REMINDER_PREFS,
      decision: approved(50),
      areaDecare: 10,
      now: NOW,
    });
    expect(d.kind).toBe('due');
    if (d.kind === 'due') {
      expect(d.type).toBe('gunluk-sulama');
      expect(d.body).toContain('50');
      expect(d.body).toContain('500 m³'); // 50 mm × 10 dekar
      expect(d.why.length).toBeGreaterThan(3);
    }
  });
  it('Dr=20: ihtiyaç yok', () => {
    expect(
      evaluateDailyReminder({
        prefs: DEFAULT_REMINDER_PREFS,
        decision: approved(20),
        areaDecare: 10,
        now: NOW,
      }),
    ).toEqual({ kind: 'none', reason: 'ihtiyac-yok' });
  });
  it('onaysız girdi: öneri yok, hatırlatıcı yok', () => {
    const decision = decideIrrigation({
      kc: { value: 1, reviewStatus: DRAFT },
      soil: { thetaFc: 0.3, thetaWp: 0.1, reviewStatus: OK },
      rootDepth: { valueM: 0.5, reviewStatus: OK },
      p: { value: 0.5, reviewStatus: OK },
      drYesterday: 50,
      et0: 5,
      forecastRainMm: 0,
    });
    expect(
      evaluateDailyReminder({ prefs: DEFAULT_REMINDER_PREFS, decision, areaDecare: 10, now: NOW }),
    ).toEqual({ kind: 'none', reason: 'onaysiz-veri' });
  });
  it('Dr bilinmiyorsa "veri-yok"', () => {
    expect(
      evaluateDailyReminder({
        prefs: DEFAULT_REMINDER_PREFS,
        decision: approved(null),
        areaDecare: 10,
        now: NOW,
      }),
    ).toEqual({ kind: 'none', reason: 'veri-yok' });
  });
  it('ayarlanan saatten önce vermez; tam saatte verir', () => {
    const prefs = { ...DEFAULT_REMINDER_PREFS, dailyHour: 10 };
    // 09:59 yerel = 06:59 UTC
    expect(
      evaluateDailyReminder({
        prefs,
        decision: approved(50),
        areaDecare: 10,
        now: new Date('2026-07-10T06:59:00Z'),
      }),
    ).toEqual({ kind: 'none', reason: 'saat-degil' });
    expect(
      evaluateDailyReminder({
        prefs,
        decision: approved(50),
        areaDecare: 10,
        now: new Date('2026-07-10T07:00:00Z'),
      }).kind,
    ).toBe('due');
  });
  it('alan bilinmiyorsa m³ yazılmaz', () => {
    const d = evaluateDailyReminder({
      prefs: DEFAULT_REMINDER_PREFS,
      decision: approved(50),
      areaDecare: null,
      now: NOW,
    });
    expect(d.kind === 'due' && d.body.includes('m³')).toBe(false);
  });
});

describe('sessiz saatler', () => {
  const q = { startHour: 22, endHour: 7 };
  it('gece yarısını aşan aralık: 22 ve 6 sessiz, 7 ve 21 değil', () => {
    expect(isQuietHour(22, q)).toBe(true);
    expect(isQuietHour(23, q)).toBe(true);
    expect(isQuietHour(0, q)).toBe(true);
    expect(isQuietHour(6, q)).toBe(true);
    expect(isQuietHour(7, q)).toBe(false);
    expect(isQuietHour(21, q)).toBe(false);
  });
  it('aynı gün içindeki aralık ve boş aralık', () => {
    expect(isQuietHour(13, { startHour: 13, endHour: 15 })).toBe(true);
    expect(isQuietHour(15, { startHour: 13, endHour: 15 })).toBe(false);
    expect(isQuietHour(3, { startHour: 5, endHour: 5 })).toBe(false);
  });
  it('yerel saat UTC+3: 21:00 UTC ertesi gün 00:00', () => {
    expect(trLocal(new Date('2026-07-10T21:00:00Z'))).toMatchObject({
      hour: 0,
      date: '2026-07-11',
    });
  });
});

describe('tekrar sınırı', () => {
  const due: ReminderDecision = {
    kind: 'due',
    type: 'nem-esigi',
    title: 't',
    body: 'b',
    why: [],
  };
  const prefs = { quiet: { startHour: 22, endHour: 7 }, maxPerDay: 3, minGapHours: 6 };
  const sent = (type: SentReminder['type'], at: string): SentReminder => ({ type, at });

  it('sessiz saatte ertelenir', () => {
    // 23:30 yerel = 20:30 UTC
    expect(applyLimits(due, [], new Date('2026-07-10T20:30:00Z'), prefs)).toEqual({
      kind: 'none',
      reason: 'sessiz-saat',
    });
  });
  it('geçmiş yokken geçer', () => {
    expect(applyLimits(due, [], NOW, prefs)).toBe(due);
  });
  it('aynı tür arasında tam 6 saat geçince izin verir, 5 sa 59 dk geçince vermez', () => {
    expect(applyLimits(due, [sent('nem-esigi', '2026-07-10T01:00:00Z')], NOW, prefs)).toBe(due);
    expect(applyLimits(due, [sent('nem-esigi', '2026-07-10T01:01:00Z')], NOW, prefs)).toEqual({
      kind: 'none',
      reason: 'sinir',
    });
  });
  it('günlük en çok 3: üçüncüden sonra durur; başka gün sayılmaz', () => {
    const three = [
      sent('gunluk-sulama', '2026-07-09T21:30:00Z'), // 10 Temmuz 00:30 yerel
      sent('nem-esigi', '2026-07-09T22:00:00Z'),
      sent('nem-esigi', '2026-07-10T00:00:00Z'),
    ];
    expect(applyLimits(due, three, NOW, prefs)).toEqual({ kind: 'none', reason: 'sinir' });
    const yesterday = three.map((h) => ({ ...h, at: '2026-07-08T09:00:00Z' }));
    expect(applyLimits(due, yesterday, NOW, prefs)).toBe(due);
  });
  it('günlük sulama günde bir kez', () => {
    const daily: ReminderDecision = { ...due, type: 'gunluk-sulama' } as ReminderDecision;
    expect(applyLimits(daily, [sent('gunluk-sulama', '2026-07-10T04:00:00Z')], NOW, prefs)).toEqual(
      {
        kind: 'none',
        reason: 'sinir',
      },
    );
  });
  it('none kararı aynen geçer', () => {
    const none: ReminderDecision = { kind: 'none', reason: 'kapali' };
    expect(applyLimits(none, [], NOW, prefs)).toBe(none);
  });
});

describe('sanitizeReminderPrefs', () => {
  it('bozuk girdi varsayılana düşer', () => {
    expect(sanitizeReminderPrefs(null)).toEqual(DEFAULT_REMINDER_PREFS);
    const p = sanitizeReminderPrefs({
      dailyHour: 25,
      maxPerDay: 0,
      minGapHours: 100,
      moistureThreshold: 3,
    } as never);
    expect(p.dailyHour).toBe(7);
    expect(p.maxPerDay).toBe(3);
    expect(p.minGapHours).toBe(6);
    expect(p.moistureThreshold).toBeNull();
  });
  it('geçerli değerler korunur', () => {
    const p = sanitizeReminderPrefs({ dailyHour: 6, moistureThreshold: 0.2, maxPerDay: 2 });
    expect(p.dailyHour).toBe(6);
    expect(p.moistureThreshold).toBe(0.2);
    expect(p.maxPerDay).toBe(2);
  });
});
