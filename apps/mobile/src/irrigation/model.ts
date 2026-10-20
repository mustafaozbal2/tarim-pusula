import type { CommandDto, DeviceStatusDto } from '@tarim/schemas';
import { tr } from '../i18n/tr';

const t = tr.irrigation;

/** Seçilebilir süreler (dk). Sunucu ve cihaz zaten 30 dakikada sınırlar. */
export const DURATIONS = [10, 20, 30] as const;
export const DEFAULT_DURATION = 20;

/** Başarısız komut sonucu bu kadar süre ekranda kalır. */
export const FAIL_SHOW_MS = 5 * 60_000;

export type Phase = 'unknown' | 'idle' | 'waiting' | 'running' | 'failed';

export type StepState = 'done' | 'active' | 'pending' | 'failed';
export interface TimelineStep {
  key: 'sent' | 'acked' | 'result';
  label: string;
  state: StepState;
}

const BAD = new Set(['rejected', 'expired', 'failed']);
const PENDING = new Set(['pending', 'sent']);

const isOpen = (s: DeviceStatusDto, now: number) =>
  s.valveOpen === true && s.closesAt !== null && new Date(s.closesAt).getTime() > now;

/** Ekranın hangi durumda olduğu: sunucudaki son komut ve cihazın bildirdiği vana durumundan. */
export function phaseOf(s: DeviceStatusDto | null, now: number): Phase {
  if (!s || !s.provisioned) return 'unknown';
  const c = s.lastCommand;
  if (c && PENDING.has(c.status) && new Date(c.expiresAt).getTime() > now) return 'waiting';
  if (isOpen(s, now)) return 'running';
  if (c && BAD.has(c.status) && now - new Date(c.createdAt).getTime() < FAIL_SHOW_MS) {
    return 'failed';
  }
  return s.valveOpen === null ? 'unknown' : 'idle';
}

export function remainingMinutes(s: DeviceStatusDto, now: number): number {
  if (!isOpen(s, now)) return 0;
  return Math.max(1, Math.ceil((new Date(s.closesAt!).getTime() - now) / 60_000));
}

/** 1200 ms > "1,2 sn". */
export function formatLatency(ms: number): string {
  const sec = ms / 1000;
  return `${sec.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} sn`;
}

/** Prototipteki 3 adımlı zaman çizelgesi: komut > onay > vana. */
export function buildTimeline(
  c: CommandDto | null,
  s: DeviceStatusDto | null,
  now: number,
): TimelineStep[] {
  if (!c) return [];
  const stop = c.action === 'close';
  const sent: TimelineStep = {
    key: 'sent',
    label: c.status === 'pending' ? t.stepSending : stop ? t.stepStopSent : t.stepSent,
    state: c.status === 'pending' ? 'active' : c.status === 'failed' ? 'failed' : 'done',
  };
  if (c.status === 'failed') return [sent];
  const acked = c.status === 'acked';
  const dead = c.status === 'rejected' || c.status === 'expired';
  const ackStep: TimelineStep = {
    key: 'acked',
    label: acked
      ? t.stepAcked.replace('{{sec}}', c.latencyMs === null ? '-' : formatLatency(c.latencyMs))
      : t.stepWaitAck,
    state: acked ? 'done' : dead ? 'failed' : 'active',
  };
  const reached = stop ? s?.valveOpen === false : s !== null && isOpen(s, now);
  const result: TimelineStep = {
    key: 'result',
    label: stop ? t.stepStopped : t.stepOpen,
    state: acked && reached ? 'done' : acked ? 'active' : 'pending',
  };
  return [sent, ackStep, result];
}

/** Başarısızlık nedeni, çiftçi diliyle. */
export function failText(c: CommandDto | null): string {
  const f = t.fail as Record<string, string>;
  if (!c) return f['other']!;
  if (c.status === 'expired') return f['zaman-asimi']!;
  return (c.reason && f[c.reason]) || f['other']!;
}

/** Her dokunuşta yeni anahtar: ağ tekrarı aynı komutu çoğaltmaz, yeni dokunuş yeni komut olur. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID
    ? c.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** "bugün 06:40", "dün 06:40" ya da "12 Ekim 06:40". */
export function whenText(iso: string, now: number): string {
  const d = new Date(iso);
  const n = new Date(now);
  const day = (x: Date) =>
    Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86_400_000);
  const clock = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const diff = day(n) - day(d);
  if (diff === 0) return `bugün ${clock}`;
  if (diff === 1) return `dün ${clock}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${clock}`;
}
