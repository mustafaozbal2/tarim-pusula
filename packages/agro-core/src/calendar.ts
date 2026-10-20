/**
 * Tarla takvimi: ürün + (isteğe bağlı) yer + takvim penceresine göre etkinlik şablonları.
 * Şablonlar uzman onayı almadıkça yalnız bilgi olarak gösterilir; uyarı/öneri/komut üretmez (kural 1).
 */
import { canDriveAdvice, needsDraftBadge, type ReviewStatus } from './review';
import { matchesField, type FieldSite, type Targeting } from './targeting';

export interface CalendarTemplate extends Targeting {
  id: string;
  cropId: string;
  title: string;
  detail: string;
  /** Fenolojik evre adı (bilgi amaçlı); tarih penceresi ana ölçüttür. */
  stage?: string | null;
  /** Her yıl tekrar eden pencere (ay 1-12, gün 1-31). Bitiş başlangıçtan önceyse yıl sonunu aşar. */
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  reviewStatus: ReviewStatus;
  source: string;
  sourceVersion: string;
  sourceDate: string;
}

export interface CalendarEvent {
  templateId: string;
  title: string;
  detail: string;
  stage: string | null;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  /** Etkinlik bugün sürüyor mu? */
  ongoing: boolean;
  needsBadge: boolean;
  /** Yalnız onaylı şablon "yapılacak" sayılır. */
  actionable: boolean;
  source: string;
  sourceVersion: string;
  sourceDate: string;
  why: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Ay uzunluğu (artık yıl dahil); 31 Şubat gibi tarihler ayın son gününe kırpılır. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Şablonun [from, to] (YYYY-MM-DD) ile kesişen yıllık oluşumları. */
export function occurrences(
  t: Pick<CalendarTemplate, 'startMonth' | 'startDay' | 'endMonth' | 'endDay'>,
  from: string,
  to: string,
): { start: string; end: string }[] {
  const y0 = Number(from.slice(0, 4)) - 1;
  const y1 = Number(to.slice(0, 4));
  const wraps = t.endMonth < t.startMonth || (t.endMonth === t.startMonth && t.endDay < t.startDay);
  const out: { start: string; end: string }[] = [];
  for (let y = y0; y <= y1; y++) {
    const start = iso(y, t.startMonth, Math.min(t.startDay, daysInMonth(y, t.startMonth)));
    const ey = wraps ? y + 1 : y;
    const end = iso(ey, t.endMonth, Math.min(t.endDay, daysInMonth(ey, t.endMonth)));
    if (start <= to && end >= from) out.push({ start, end });
  }
  return out;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tarlanın [today, today+days] aralığındaki etkinlikleri, başlangıca göre sıralı. */
export function fieldCalendar(
  field: FieldSite,
  templates: CalendarTemplate[],
  today: string,
  days = 60,
): CalendarEvent[] {
  const to = addDays(today, days);
  const events: CalendarEvent[] = [];
  for (const t of templates) {
    if (!field.cropId || t.cropId !== field.cropId) continue;
    if (!matchesField(t, field)) continue;
    for (const o of occurrences(t, today, to)) {
      const badge = needsDraftBadge(t.reviewStatus);
      events.push({
        templateId: t.id,
        title: t.title,
        detail: t.detail,
        stage: t.stage ?? null,
        start: o.start,
        end: o.end,
        ongoing: o.start <= today && o.end >= today,
        needsBadge: badge,
        actionable: canDriveAdvice(t.reviewStatus),
        source: t.source,
        sourceVersion: t.sourceVersion,
        sourceDate: t.sourceDate,
        why:
          `Bu etkinlik ${t.stage ? `"${t.stage}" evresi için ` : ''}ürününüze göre ` +
          `${o.start} – ${o.end} aralığına konmuştur. Kaynak: ${t.source} (${t.sourceVersion}, ${t.sourceDate}).` +
          (badge ? ' Uzman onayı bekliyor; bu yüzden yalnız bilgi olarak gösterilir.' : ''),
      });
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
