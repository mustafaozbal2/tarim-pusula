/** Sorgu: dönem, toprak ve (isteğe bağlı) çiftçinin kendi sulama alışkanlığı. */
export function savingsQuery(o: {
  days: number;
  soil: string;
  intervalDays?: string;
  depthMm?: string;
}): string {
  const p = new URLSearchParams({ days: String(o.days), soil: o.soil });
  const i = Number(o.intervalDays?.replace(',', '.'));
  const d = Number(o.depthMm?.replace(',', '.'));
  if (o.intervalDays && o.depthMm && i > 0 && d > 0) {
    p.set('intervalDays', String(Math.round(i)));
    p.set('depthMm', String(d));
  }
  return p.toString();
}
