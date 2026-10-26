import type {
  AnnouncementDto,
  CalendarDto,
  OrnekIcerikDto,
  SupportMatchDto,
  TodayDto,
} from '../api/client';
import type { ImageName } from '../assets';
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
  /** "Hepsi" sekmesinde gösterilmez (takvimden gelen rehber satırı, zaman satırının tekrarıdır). */
  hideInAll?: boolean;
  /** Demo örnek verisi (kaynak etiketi "Örnek veri (demo)"). */
  sample?: boolean;
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
  /** Ürünün demo örnek içeriği (yalnız demo sunucusu verir); gerçek modda null. */
  sample?: OrnekIcerikDto | null;
  /** Bugünün yerel tarihi (YYYY-MM-DD): örnek satırların tarihi buna göre hesaplanır. */
  todayIso?: string;
}

/** Her sekmede gösterilecek kayıt sayısı; demo örnek verisi gerçek kaydı bu sayıya tamamlar. */
export const ROWS_PER_TAB = 5;

/** ISO tarihe gün ekler (UTC hesabı; saat dilimi kayması olmaz). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** Yerel takvim günü (YYYY-MM-DD). */
export function localIso(now = new Date()): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const SAMPLE_KINDS: [Exclude<HomeRow['kind'], 'duyuru'>, keyof OrnekIcerikDto][] = [
  ['zaman', 'faaliyetZamani'],
  ['rehber', 'faaliyetRehberi'],
  ['uyari', 'erkenUyarilar'],
  ['hibe', 'destekler'],
];

/**
 * Demo: her sekmeyi gerçek (onaylı) kayıtlardan sonra örnek veriyle ROWS_PER_TAB'a tamamlar.
 * Örnek satırlar uyarı tonunda DEĞİLDİR (Dikkat rozeti yakmaz) ve kaynakları "Örnek veri (demo)"dur.
 */
function sampleRows(rows: HomeRow[], sample: OrnekIcerikDto, todayIso: string): HomeRow[] {
  const out: HomeRow[] = [];
  const src = `${sample.kaynak} · ${sample.surum} · ${sample.tarih}`;
  for (const [kind, key] of SAMPLE_KINDS) {
    const have = rows.filter((r) => r.kind === kind).length;
    const list = sample[key] as OrnekIcerikDto['faaliyetZamani'];
    list.slice(0, Math.max(0, ROWS_PER_TAB - have)).forEach((r, i) => {
      out.push({
        id: `ornek-${kind}-${sample.urunId}-${i}`,
        kind,
        date: addDays(todayIso, r.gunFarki),
        title: r.baslik,
        detail: r.ozet,
        source: src,
        tone: 'normal',
        sample: true,
      });
    });
  }
  return out;
}

/** Kayan şerit kartı: onaylı duyuru ya da demo örnek kartı. */
export interface HomeCard {
  id: string;
  title: string;
  /** images/ yuvası (kart_1..5); duyurunun kendi görseli varsa `uri` öncelikli. */
  image: ImageName;
  uri?: string | null;
  /** Duyuru kartıysa duyuru kimliği; örnek kartsa sıra numarası. */
  announcementId?: string;
  sampleIndex?: number;
}

/** Kayan şeritteki en çok kart sayısı (G23: 10-12 kart). */
export const MAX_CARDS = 12;
const CARD_IMAGES = Array.from({ length: MAX_CARDS }, (_, i) => `kart_${i + 1}.jpg` as ImageName);

/**
 * Şerit: önce onaylı duyurular (uzman içerikleri), sonra demo örnek kartları; en çok MAX_CARDS.
 * Görsel her zaman vardır ve şeritte aynı görsel iki kez kullanılmaz (duyurunun kendi görseli yoksa).
 */
export function homeCards(
  announcements: AnnouncementDto[],
  sample: OrnekIcerikDto | null | undefined,
): HomeCard[] {
  const anns = announcements.filter((a) => !a.needsBadge).slice(0, MAX_CARDS);
  const samples = (sample?.kartlar ?? [])
    .slice(0, Math.max(0, MAX_CARDS - anns.length))
    .map((k, i) => ({
      id: `ornek-kart-${i}`,
      title: k.baslik,
      image: /^kart_[1-5]\.jpg$/.test(k.gorsel)
        ? (k.gorsel as ImageName)
        : (`kart_${(i % 5) + 1}.jpg` as ImageName),
      sampleIndex: i,
    }));
  // Duyurular, örnek kartların kullanmadığı görselleri alır: şeritte aynı görsel iki kez görünmez.
  const used = new Set<string>(samples.map((c) => c.image));
  const free = CARD_IMAGES.filter((f) => !used.has(f));
  const cards: HomeCard[] = anns.map((a, i) => ({
    id: `duyuru-${a.id}`,
    title: a.title,
    image: free[i % Math.max(1, free.length)] ?? 'kart_1.jpg',
    uri: a.imageDataUrl,
    announcementId: a.id,
  }));
  return [...cards, ...samples];
}

/**
 * Arazi adının yazı boyutu: kutuya tek satırda sığacak en büyük boyut (19 px'ten 13 px'e kadar).
 * Manrope orta kalınlıkta ortalama harf genişliği ≈ 0,55 x yazı boyutu (ölçülerek seçildi).
 */
export function fitFontSize(text: string, boxWidth: number, max = 19, min = 13): number {
  const len = Math.max(1, [...text].length);
  return Math.max(min, Math.min(max, Math.floor(boxWidth / (len * 0.55))));
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
      hideInAll: true,
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
  if (input.sample) rows.push(...sampleRows(rows, input.sample, input.todayIso ?? localIso()));
  // Tarihe göre; aynı günde gerçek (onaylı) kayıt örnek veriden önce gelir.
  return rows.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? -1
        : 1
      : Boolean(a.sample) !== Boolean(b.sample)
        ? a.sample
          ? 1
          : -1
        : a.id < b.id
          ? -1
          : 1,
  );
}

/**
 * Sekmeye göre satırlar. "Hepsi" hepsini birleştirir; yalnız takvimden gelen rehber satırları çıkar
 * (onlar aynı işin açıklamasıdır; tekrar olmasın).
 */
export function rowsForTab(rows: HomeRow[], tab: HomeTab): HomeRow[] {
  if (tab === 'hepsi') return rows.filter((r) => !r.hideInAll);
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
