/** Sanal ESP32 iskeleti. Gerçek protokol (MQTT/TLS, komut/ack) sulama görevinde eklenir. */
export const MAX_VALVE_MINUTES = 30;

export function clampValveMinutes(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.min(requested, MAX_VALVE_MINUTES);
}
