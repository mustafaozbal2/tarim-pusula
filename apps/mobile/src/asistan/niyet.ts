/**
 * Asistan (yeşil robot) niyet eşleyici: çiftçinin yazdığı ya da söylediği cümleden uygulamadaki işi
 * bulur ve o ekrana götürür. Kendisi tarım bilgisi ÜRETMEZ (değişmez kural 2: ilaç dozu, karışım
 * oranı uydurmaz); bilmediği soruyu uzmana yönlendirir. Nuvia bağlanınca aynı eylem listesini kullanır.
 */
export type EylemKey =
  | 'tarla-ekle'
  | 'tarlalarim'
  | 'uzmana-sor'
  | 'sorularim'
  | 'hava'
  | 'sulama'
  | 'takvim'
  | 'pazar'
  | 'bildirimler'
  | 'ayarlar';

export interface Eylem {
  key: EylemKey;
  label: string;
  route: string;
  /** Cevap balonunda gösterilecek kısa açıklama. */
  say: string;
}

export const EYLEMLER: Record<EylemKey, Eylem> = {
  'tarla-ekle': {
    key: 'tarla-ekle',
    label: 'Tarla ekle',
    route: '/tarla-ekle',
    say: 'Tarla eklemeyi açıyorum. Konumunu ve ürününü seçmen yeterli.',
  },
  tarlalarim: {
    key: 'tarlalarim',
    label: 'Tarlalarım',
    route: '/tarlalarim',
    say: 'Tarlalarını açıyorum.',
  },
  'uzmana-sor': {
    key: 'uzmana-sor',
    label: 'Uzmana sor',
    route: '/soru-sor',
    say: 'Sorunu bölgendeki tarım uzmanına iletelim. Fotoğraf da ekleyebilirsin.',
  },
  sorularim: {
    key: 'sorularim',
    label: 'Sorularım',
    route: '/sorularim',
    say: 'Sorduğun soruları ve uzman cevaplarını açıyorum.',
  },
  hava: {
    key: 'hava',
    label: 'Hava durumu',
    route: '/hava',
    say: 'Tarlanın hava durumunu açıyorum.',
  },
  sulama: {
    key: 'sulama',
    label: 'Sulama',
    route: '/sulama',
    say: 'Sulama ekranını açıyorum.',
  },
  takvim: {
    key: 'takvim',
    label: 'İş takvimi',
    route: '/takvim',
    say: 'Ürününün iş takvimini açıyorum.',
  },
  pazar: {
    key: 'pazar',
    label: 'Pazar fiyatları',
    route: '/pazar',
    say: 'Hal ve borsa fiyatlarını açıyorum.',
  },
  bildirimler: {
    key: 'bildirimler',
    label: 'Bildirimler',
    route: '/bildirimler',
    say: 'Bildirimlerini açıyorum.',
  },
  ayarlar: { key: 'ayarlar', label: 'Ayarlar', route: '/ayarlar', say: 'Ayarları açıyorum.' },
};

/** Robot ilk açıldığında gösterilen hızlı seçenekler. */
export const HIZLI: EylemKey[] = ['tarla-ekle', 'uzmana-sor', 'hava', 'sulama', 'takvim', 'pazar'];

/** Türkçe küçük harf, aksan sadeleştirme (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u). */
export function sadelestir(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sıra önemli: daha özel kalıp önce (ör. "tarla ekle", "tarlalarım"dan önce).
const KURALLAR: [EylemKey, RegExp][] = [
  [
    'tarla-ekle',
    /\b(tarla|arazi|bahce|parsel)\w* (ekle|kaydet|olustur|ac)|\byeni (tarla|arazi|bahce|parsel)|\b(ekle|kaydet)\w* (tarla|arazi|bahce)/,
  ],
  ['sorularim', /\bsorularim|\bsordugum|\buzman\w* cevab|\bcevap geldi/],
  [
    'uzmana-sor',
    /\buzman|\bdanis|\bziraat muhendis|\bhastalik|\bleke|\bbocek|\bzararli|\bkurtlan|\bsarar|\bkuru(yor|du)|\bciftci sor|\bsoru sor/,
  ],
  ['sulama', /\bsula|\bsu ihtiyac|\bvana|\bdamla|\bsuyu/],
  ['hava', /\bhava|\byagmur|\bdon\b|\bdon olacak|\bsicaklik|\bruzgar|\bkar yag|\bdolu/],
  ['takvim', /\btakvim|\bne zaman|\bbudama|\bekim zaman|\bhasat|\bgubre zaman|\bfaaliyet/],
  ['pazar', /\bfiyat|\bpazar|\bborsa|\bhal\b|\bsatis|\bkac lira/],
  ['bildirimler', /\bbildirim|\bduyuru|\buyari/],
  ['tarlalarim', /\btarlalarim|\barazilerim|\btarla(m|lar)\b|\barazi(m|ler)\b/],
  ['ayarlar', /\bayar|\bprofil|\bcikis yap|\byazi boyut/],
];

/** Cümleden eylem; bulunamazsa null (robot uzmana yönlendirmeyi önerir). */
export function niyetBul(metin: string): Eylem | null {
  const s = sadelestir(metin);
  if (!s) return null;
  for (const [key, re] of KURALLAR) if (re.test(s)) return EYLEMLER[key];
  return null;
}
