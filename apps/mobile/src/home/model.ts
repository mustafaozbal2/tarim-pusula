import type { AnnouncementDto, CalendarDto, SupportMatchDto, TodayDto } from '../api/client';
import { dayText, rangeText } from '../calendar/model';
import { frostCardModel } from '../today/model';

/** Ana sayfadaki 5 sekme (docs/ANASAYFA_SPEC.md). */
export type HomeTab = 'zaman' | 'rehber' | 'uyari' | 'hibe' | 'hepsi';
export const HOME_TABS: { key: HomeTab; label: string }[] = [
  { key: 'zaman', label: 'Faaliyet Zamanı' },
  { key: 'rehber', label: 'Faaliyet Rehberi' },
  { key: 'uyari', label: 'Erken Uyarılar' },
  { key: 'hibe', label: 'Hibe, Kredi ve Desteklemeler' },
  { key: 'hepsi', label: 'Hepsi' },
];

export interface HomeRow {
  id: string;
  /** Satırın gösterdiği tür; "Hepsi" sekmesi rehber dışındakileri toplar. */
  kind: Exclude<HomeTab, 'hepsi'> | 'duyuru';
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Dokununca açılan ayrıntı. */
  detail: string;
  /** Kaynak + tarih (+ sürüm) etiketi; atıfsız satır yoktur (değişmez kural 2). */
  source: string;
  tone: 'normal' | 'warning';
}

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Tarih kutusu: üç satır (ay / gün / yıl). Girdi ISO tarih ya da tarih-saat. */
export function dateBox(iso: string): { month: string; day: string; year: string } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { month: MONTHS[(m ?? 1) - 1] ?? '', day: String(d ?? ''), year: String(y ?? '') };
}

export interface HomeInput {
  calendar: CalendarDto | null;
  today: TodayDto | null;
  supports: SupportMatchDto[];
  announcements: AnnouncementDto[];
}

/**
 * Tüm satırlar: yalnız ONAYLI ve kaynaklı bilgi. Onaysız (needsBadge/badge) satır hiç üretilmez ve
 * ekranda "onay bekliyor" yazısı da çıkmaz (G19.7, değişmez kural 1).
 */
export function buildHomeRows(input: HomeInput): HomeRow[] {
  const rows: HomeRow[] = [];
  for (const e of input.calendar?.events ?? []) {
    if (e.needsBadge || !e.source) continue;
    const src = `${e.source} · ${e.sourceVersion} · ${e.sourceDate}`;
    rows.push({
      id: `zaman-${e.templateId}-${e.start}`,
      kind: 'zaman',
      date: e.start,
      title: `${e.title} (${rangeText(e)})`,
      detail: e.detail,
      source: src,
      tone: 'normal',
    });
    rows.push({
      id: `rehber-${e.templateId}-${e.start}`,
      kind: 'rehber',
      date: e.start,
      title: e.detail ? `${e.title}: ${e.detail}` : e.title,
      detail: e.why,
      source: src,
      tone: 'normal',
    });
  }
  if (input.today) {
    const f = frostCardModel(input.today.frost);
    if (f.kind === 'warning' || f.kind === 'watch') {
      rows.push({
        id: 'uyari-don',
        kind: 'uyari',
        date: input.today.generatedAt.slice(0, 10),
        title: f.title,
        detail: `${f.body} ${f.why}`,
        source: `${input.today.frost.source} · ${input.today.frost.fetchedAt.slice(0, 10)}`,
        tone: 'warning',
      });
    }
  }
  for (const m of input.supports) {
    if (m.badge || m.status === 'kapali' || m.status === 'onay-bekliyor') continue;
    const s = m.support;
    if (!s.source || !s.sourceDate) continue;
    rows.push({
      id: `hibe-${s.id}`,
      kind: 'hibe',
      date: s.applyFrom ?? s.sourceDate,
      title: s.title,
      detail: [s.summary, ...m.why].filter(Boolean).join(' · '),
      source: `${s.source} · ${s.sourceVersion} · ${s.sourceDate}`,
      tone: 'normal',
    });
  }
  for (const a of input.announcements) {
    if (a.needsBadge || !a.sourceOrg) continue;
    rows.push({
      id: `duyuru-${a.id}`,
      kind: 'duyuru',
      date: a.publishedAt.slice(0, 10),
      title: a.title,
      detail: a.body,
      source: `${a.sourceOrg} · ${a.publishedAt.slice(0, 10)}`,
      tone: 'normal',
    });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

/** Sekmeye göre satırlar. "Hepsi", rehberi çıkarır (rehber, zamanla aynı işin açıklamasıdır; tekrar olmasın). */
export function rowsForTab(rows: HomeRow[], tab: HomeTab): HomeRow[] {
  if (tab === 'hepsi') return rows.filter((r) => r.kind !== 'rehber');
  return rows.filter((r) => r.kind === tab);
}

/** Sol köşe "Dikkat" rozetinin sayısı: yalnız aktif VE onaylı uyarılar. */
export function attentionCount(rows: HomeRow[]): number {
  return rows.filter((r) => r.kind === 'uyari' && r.tone === 'warning').length;
}

/** Sekme boşken kısa, dürüst metin. */
export function emptyText(tab: HomeTab): string {
  switch (tab) {
    case 'zaman':
      return 'Önümüzdeki günler için kayıtlı faaliyet yok.';
    case 'rehber':
      return 'Bu ürün için faaliyet rehberi şu an yok.';
    case 'uyari':
      return 'Şu an aktif erken uyarı yok.';
    case 'hibe':
      return 'Bu arazi için açık hibe, kredi ya da destek kaydı yok.';
    default:
      return 'Şimdilik gösterilecek kayıt yok.';
  }
}

/** Kayan şeritte sıradaki kart (döngüsel). */
export function nextCardIndex(current: number, count: number): number {
  return count <= 0 ? 0 : (current + 1) % count;
}

export const CARD_INTERVAL_MS = 4000;

/** İl, ilçe satırı: "Isparta, Merkez". */
export function placeLine(f: {
  province: string | null;
  district: string | null;
  village: string | null;
}): string {
  return [f.province, f.district].filter(Boolean).join(', ') || f.village || '';
}

export { dayText };
