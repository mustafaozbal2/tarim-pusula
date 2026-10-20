import type { CommandDto, DeviceStatusDto } from '@tarim/schemas';
import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  failText,
  formatLatency,
  newIdempotencyKey,
  phaseOf,
  remainingMinutes,
  whenText,
} from './irrigation/model';
import { tr } from './i18n/tr';

const NOW = Date.parse('2026-10-20T10:00:00Z');
const iso = (ms: number) => new Date(NOW + ms).toISOString();

const cmd = (over: Partial<CommandDto> = {}): CommandDto => ({
  id: 'c1',
  deviceId: 'd1',
  action: 'open',
  minutes: 20,
  status: 'acked',
  reason: null,
  createdAt: iso(-5_000),
  expiresAt: iso(55_000),
  sentAt: iso(-4_900),
  ackedAt: iso(-3_800),
  latencyMs: 1200,
  ...over,
});
const status = (over: Partial<DeviceStatusDto> = {}): DeviceStatusDto => ({
  deviceId: 'd1',
  fieldId: 'f1',
  name: 'Vana 1',
  valveOpen: false,
  closesAt: null,
  lastSeenAt: iso(-1000),
  online: true,
  provisioned: true,
  lastCommand: null,
  lastRun: null,
  ...over,
});

describe('sulama ekranı durumu', () => {
  it('cihaz kurulmamış ya da hiç haber yok: bilinmiyor', () => {
    expect(phaseOf(null, NOW)).toBe('unknown');
    expect(phaseOf(status({ provisioned: false }), NOW)).toBe('unknown');
    expect(phaseOf(status({ valveOpen: null }), NOW)).toBe('unknown');
  });
  it('vana açık ve süre dolmadıysa "su akıyor"', () => {
    const s = status({ valveOpen: true, closesAt: iso(20 * 60_000), lastCommand: cmd() });
    expect(phaseOf(s, NOW)).toBe('running');
    expect(remainingMinutes(s, NOW)).toBe(20);
  });
  it('kapanış zamanı geçtiyse açık sayılmaz', () => {
    const s = status({ valveOpen: true, closesAt: iso(-1000), lastCommand: cmd() });
    expect(phaseOf(s, NOW)).toBe('idle');
    expect(remainingMinutes(s, NOW)).toBe(0);
  });
  it('komut yolda: bekliyor; ack gelmeden TTL dolduysa bekleme bitti ve başarısız görünür', () => {
    const waiting = status({
      lastCommand: cmd({ status: 'sent', ackedAt: null, latencyMs: null }),
    });
    expect(phaseOf(waiting, NOW)).toBe('waiting');
    const expired = status({
      lastCommand: cmd({ status: 'expired', ackedAt: null, latencyMs: null }),
    });
    expect(phaseOf(expired, NOW)).toBe('failed');
    // Beş dakika sonra eski başarısızlık ekranı meşgul etmez.
    expect(phaseOf(expired, NOW + 6 * 60_000)).toBe('idle');
  });
  it('kalan süre yukarı yuvarlanır (en az 1 dk)', () => {
    const s = status({ valveOpen: true, closesAt: iso(30_000) });
    expect(remainingMinutes(s, NOW)).toBe(1);
  });
});

describe('zaman çizelgesi: komut > onay > vana', () => {
  it('açıldı: üç adım tamam, onay süresi yazılır', () => {
    const s = status({ valveOpen: true, closesAt: iso(20 * 60_000) });
    const steps = buildTimeline(cmd(), s, NOW);
    expect(steps.map((x) => x.state)).toEqual(['done', 'done', 'done']);
    expect(steps[1]!.label).toBe('Cihaz onayladı (1,2 sn)');
    expect(steps[2]!.label).toBe('Vana açık, akış başladı');
  });
  it('onay bekleniyor: ikinci adım etkin, üçüncü bekler', () => {
    const steps = buildTimeline(
      cmd({ status: 'sent', latencyMs: null, ackedAt: null }),
      status(),
      NOW,
    );
    expect(steps.map((x) => x.state)).toEqual(['done', 'active', 'pending']);
  });
  it('cihaz reddetti: onay adımı başarısız, vana adımı beklemede (açılmadı)', () => {
    const steps = buildTimeline(cmd({ status: 'rejected', reason: 'expired' }), status(), NOW);
    expect(steps.map((x) => x.state)).toEqual(['done', 'failed', 'pending']);
  });
  it('durdurma komutu kendi metinleriyle', () => {
    const steps = buildTimeline(
      cmd({ action: 'close', minutes: null }),
      status({ valveOpen: false }),
      NOW,
    );
    expect(steps[0]!.label).toBe(tr.irrigation.stepStopSent);
    expect(steps[2]).toMatchObject({ label: tr.irrigation.stepStopped, state: 'done' });
  });
  it('komut yoksa çizelge yok', () => {
    expect(buildTimeline(null, status(), NOW)).toEqual([]);
  });
});

describe('metinler', () => {
  it('gecikme Türkçe ondalıkla', () => {
    expect(formatLatency(1200)).toBe('1,2 sn');
    expect(formatLatency(80)).toBe('0,1 sn');
  });
  it('başarısızlık nedenleri çiftçi dilinde ve "vana açılmadı" der', () => {
    expect(failText(cmd({ status: 'expired' }))).toContain('Vana açılmadı');
    expect(failText(cmd({ status: 'rejected', reason: 'expired' }))).toContain('Vana açılmadı');
    expect(failText(cmd({ status: 'failed', reason: 'cihaz-kurulmamis' }))).toContain('kurulmamış');
    expect(failText(cmd({ status: 'rejected', reason: 'bad_signature' }))).toContain(
      'kabul etmedi',
    );
  });
  it('her dokunuş farklı idempotency anahtarı üretir (en az 8 karakter)', () => {
    const a = newIdempotencyKey();
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(newIdempotencyKey()).not.toBe(a);
  });
  it('son sulama: bugün / dün', () => {
    const d = new Date(NOW);
    const yest = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 6, 40).toISOString();
    expect(whenText(yest, NOW)).toMatch(/^dün /);
    expect(whenText(new Date(NOW - 1000).toISOString(), NOW)).toMatch(/^bugün /);
  });
});
