import {
  capabilitiesFor,
  CONNECTION_METHOD_LABELS,
  DEVICE_KIND_LABELS,
  DEVICE_KINDS,
  KIND_METHODS,
  type Capability,
  type ConnectionMethod,
  type DeviceKind,
  type DeviceRegister,
} from '@tarim/schemas';
import { validateRegistration } from '@tarim/devices';
import type { DeviceDto, ReadingsDto } from '../api/client';

export { DEVICE_KINDS, DEVICE_KIND_LABELS, KIND_METHODS, CONNECTION_METHOD_LABELS };

export function kindLabel(kind: string): string {
  return DEVICE_KIND_LABELS[kind as DeviceKind] ?? kind;
}

export function methodLabel(method: string | undefined): string {
  return CONNECTION_METHOD_LABELS[method as ConnectionMethod] ?? '-';
}

/** Bir arazinin cihazları ve bunlardan doğan yetenekler (kartlar kendiliğinden açılır). */
export function fieldDevices(devices: readonly DeviceDto[], fieldId: string | undefined) {
  const list = devices.filter((d) => d.fieldId === fieldId);
  return { list, capabilities: capabilitiesFor(list.map((d) => d.kind)) as Capability[] };
}

/** Kart satırı: "Ad · tür · üretici model · kaynak · eklenme tarihi · sürüm". */
export function deviceLines(d: DeviceDto): string[] {
  const made = [d.manufacturer, d.model].filter(Boolean).join(' ');
  const lines = [kindLabel(d.kind)];
  if (made) lines.push(made);
  lines.push(`Bağlantı: ${methodLabel(d.connectionMethod)}`);
  if (d.source)
    lines.push(`Kaynak: ${d.source}${d.adapterVersion ? ` (sürüm ${d.adapterVersion})` : ''}`);
  if (d.createdAt) lines.push(`Eklenme: ${d.createdAt.slice(0, 10)}`);
  return lines;
}

export interface RegisterForm {
  fieldId: string | undefined;
  name: string;
  kind: DeviceKind | null;
  method: ConnectionMethod | null;
  manufacturer: string;
  model: string;
  pairingCode: string;
}

export type FormResult = { ok: true; body: DeviceRegister } | { ok: false; message: string };

/** Formu kayıt gövdesine çevirir; sunucuyla aynı doğrulamayı (packages/devices) önce istemcide çalıştırır. */
export function buildRegisterBody(f: RegisterForm): FormResult {
  if (!f.fieldId) return { ok: false, message: 'Önce bir arazi seç.' };
  if (!f.kind) return { ok: false, message: 'Cihaz türünü seç.' };
  if (!f.method) return { ok: false, message: 'Bağlantı yöntemini seç.' };
  if (!f.name.trim()) return { ok: false, message: 'Cihaza bir ad ver.' };
  const body: DeviceRegister = {
    fieldId: f.fieldId,
    name: f.name.trim(),
    kind: f.kind,
    method: f.method,
    ...(f.manufacturer.trim() ? { manufacturer: f.manufacturer.trim() } : {}),
    ...(f.model.trim() ? { model: f.model.trim() } : {}),
    ...(f.pairingCode.trim() ? { pairingCode: f.pairingCode.trim() } : {}),
  };
  const v = validateRegistration(body);
  return v.ok ? { ok: true, body } : { ok: false, message: v.message };
}

export interface MoisturePoint {
  at: string;
  /** Yüzde (0-100). */
  pct: number;
}

export function moisturePoints(r: Pick<ReadingsDto, 'readings'>): MoisturePoint[] {
  return r.readings
    .filter((x) => Number.isFinite(x.value))
    .map((x) => ({ at: x.at, pct: Math.round(x.value * 1000) / 10 }));
}

/** Grafik çubukları: yükseklik 0..1 (nem yüzdesi / 50: üst sınır %50 nemdir; üstü kırpılır). */
export function moistureBars(points: MoisturePoint[], max = 50) {
  return points.map((p) => ({
    height: Math.min(1, Math.max(0, p.pct / max)),
    label: `%${String(p.pct).replace('.', ',')}`,
    at: p.at,
  }));
}

/** Son ölçüm özeti: "%21 · 2 saat önce". */
export function latestMoistureText(points: MoisturePoint[], now: Date): string | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const h = Math.max(0, (now.getTime() - Date.parse(last.at)) / 3_600_000);
  const ago = h < 1 ? `${Math.max(1, Math.round(h * 60))} dk önce` : `${Math.round(h)} saat önce`;
  return `%${String(last.pct).replace('.', ',')} · ${ago}`;
}
