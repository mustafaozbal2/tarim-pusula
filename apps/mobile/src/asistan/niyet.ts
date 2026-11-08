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

/** Levenshtein uzaklığı (ses tanıma hatalarına dayanıklı eşleşme için). */
export function uzaklik(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length]![b.length]!;
}

const YER = [
  'arazi',
  'tarla',
  'bahce',
  'parsel',
  'ciftlik',
  'alan',
  'bag',
  'toprak',
  'zemin',
  'arsa',
];
const EKLE = ['ekle', 'kaydet', 'olustur', 'tanimla', 'girmek', 'ekim'];

/** Kelime, listedeki bir sözcüğün (ek almış hali dahil) 1 harf hatalı biçimi mi? Kısa sözcükte tam eşleşme ister. */
function yakin(kelime: string, hedefler: string[]): boolean {
  return hedefler.some((h) => {
    const n = h.length;
    const bas = kelime.slice(0, n);
    if (n <= 3) return bas === h && kelime.length <= n + 4;
    return uzaklik(bas, h) <= 1 || (kelime.length > n && uzaklik(kelime.slice(0, n + 1), h) <= 1);
  });
}

/**
 * "Arazi eklemek istiyorum" gibi cümleler sesle yanlış yazılabilir ("arası ekle mek", "harazi ekleyelim"):
 * bir yer sözcüğü + ekleme sözcüğü, ya da "yeni bir yer/alan" varsa tarla ekleme niyetidir. Sorgu soruysa
 * ("tarlamı nasıl eklerim") yine ekleme sayılır; "göster/listele" gibi fiiller varsa sayılmaz.
 */
export function tarlaEklemeBulanik(sade: string): boolean {
  const k = sade.split(' ').filter(Boolean);
  if (k.some((x) => /^(goster|listele|sil|duzenle|degistir|kac)/.test(x))) return false;
  // Ses tanıma bazen "ekle mek" diye böler: bitişik iki kelimeyi birleştirerek de dene.
  const birlesik = k.flatMap((x, i) => (i + 1 < k.length ? [x + k[i + 1]!] : []));
  const ekle = [...k, ...birlesik].some((x) => yakin(x, EKLE));
  const yer = k.some((x) => yakin(x, YER));
  const yeniYer = k.includes('yeni') && k.some((x) => /^(yer|alan|arazi|tarla|bahce|bag)/.test(x));
  return (ekle && yer) || (ekle && yeniYer) || yeniYer;
}

/** Cümleden eylem; bulunamazsa null (robot uzmana yönlendirmeyi önerir). */
export function niyetBul(metin: string): Eylem | null {
  const s = sadelestir(metin);
  if (!s) return null;
  if (tarlaEklemeBulanik(s) && !/\b(sorularim|cevab)/.test(s)) return EYLEMLER['tarla-ekle'];
  for (const [key, re] of KURALLAR) if (re.test(s)) return EYLEMLER[key];
  if (tarlaEklemeBulanik(s)) return EYLEMLER['tarla-ekle'];
  return null;
}
