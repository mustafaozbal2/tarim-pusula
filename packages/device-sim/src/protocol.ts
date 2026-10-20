import { createHmac, timingSafeEqual } from 'node:crypto';

/** Vananın bir kesintisiz açılışta açık kalabileceği sert üst sınır (cihaz yazılımı uygular). */
export const MAX_VALVE_MINUTES = 30;
/** Sunucunun komuta verdiği varsayılan yaşam süresi (TTL). */
export const DEFAULT_COMMAND_TTL_MS = 60_000;

export function clampValveMinutes(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(requested, MAX_VALVE_MINUTES);
}

export const cmdTopic = (deviceId: string) => `tp/dev/${deviceId}/cmd`;
export const ackTopic = (deviceId: string) => `tp/dev/${deviceId}/ack`;
export const stateTopic = (deviceId: string) => `tp/dev/${deviceId}/state`;
/** Sunucunun tüm cihazlar için dinlediği süzgeçler. */
export const ALL_ACKS = 'tp/dev/+/ack';
export const ALL_STATES = 'tp/dev/+/state';

export type CommandAction = 'open' | 'close';

/** Sunucudan cihaza giden komut. `sig` diğer tüm alanların HMAC-SHA256 imzasıdır. */
export interface CommandMsg {
  v: 1;
  id: string;
  deviceId: string;
  action: CommandAction;
  /** open için istenen süre (dakika); cihaz yine de azami süreye kırpar. */
  minutes: number;
  issuedAt: number;
  expiresAt: number;
  sig: string;
}

export type AckStatus = 'accepted' | 'rejected';
export type RejectReason =
  'bad_signature' | 'bad_message' | 'wrong_device' | 'expired' | 'stale' | 'invalid_duration';

/** Cihazdan sunucuya onay. `at` cihaz saatidir. */
export interface AckMsg {
  v: 1;
  commandId: string;
  deviceId: string;
  status: AckStatus;
  reason?: RejectReason;
  at: number;
  valveOpen: boolean;
  closesAt: number | null;
}

export type StateReason = 'boot' | 'command' | 'timeout' | 'power' | 'online';

export interface StateMsg {
  v: 1;
  deviceId: string;
  valveOpen: boolean;
  closesAt: number | null;
  at: number;
  reason: StateReason;
}

/** Cihaz sırrından ayrı amaçlı anahtarlar türetilir: biri sızsa diğeri açığa çıkmaz. */
const derive = (secret: string, purpose: string) =>
  createHmac('sha256', secret).update(`tarim-pusula/${purpose}/v1`).digest('hex');
export const mqttPasswordFor = (secret: string) => derive(secret, 'mqtt');
export const commandKeyFor = (secret: string) => derive(secret, 'cmd');

const canonical = (m: Omit<CommandMsg, 'sig'>) =>
  [m.v, m.id, m.deviceId, m.action, m.minutes, m.issuedAt, m.expiresAt].join('|');

export function signCommand(secret: string, m: Omit<CommandMsg, 'sig'>): CommandMsg {
  const sig = createHmac('sha256', commandKeyFor(secret)).update(canonical(m)).digest('hex');
  return { ...m, sig };
}

export function verifyCommand(secret: string, m: CommandMsg): boolean {
  const expected = createHmac('sha256', commandKeyFor(secret)).update(canonical(m)).digest();
  const given = Buffer.from(m.sig, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function isCommandMsg(x: unknown): x is CommandMsg {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  return (
    m['v'] === 1 &&
    typeof m['id'] === 'string' &&
    typeof m['deviceId'] === 'string' &&
    (m['action'] === 'open' || m['action'] === 'close') &&
    typeof m['minutes'] === 'number' &&
    typeof m['issuedAt'] === 'number' &&
    typeof m['expiresAt'] === 'number' &&
    typeof m['sig'] === 'string'
  );
}
