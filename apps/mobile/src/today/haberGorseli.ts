import type { ImageName } from '../assets';
import KAYNAKLAR from '../../assets/haber/KAYNAKLAR.json';

/**
 * Haber görseli kütüphanesi (MP-1): duyurunun kendi görseli yoksa konusuna uygun, lisansı açık bir fotoğraf
 * seçilir (hayvan haberi → hayvan, fıstık → fıstık, don → don). Görsel üretilmez/uydurulmaz; kütüphane
 * apps/mobile/assets/haber (scripts/haber-gorselleri.py, atıf: KAYNAKLAR.json). Eşleşme yoksa kategoriye göre genel görsel.
 */
const FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};
export const sadelestir = (s: string): string =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .replace(/\s+/g, ' ');

/** Sıra önemlidir: özel konu önce, genel konu sonra. Kalıplar sadeleştirilmiş (ASCII) metinde aranır. */
const KURALLAR: [RegExp, ImageName][] = [
  [/\b(ari|aricilik|kovan|bal uretim|polen|oglu ari)/, 'haber_ari.jpg'],
  [/\b(tavuk|yumurta|kanatli|pilic|horoz|hindi|kumes)/, 'haber_tavuk.jpg'],
  [/\b(koyun|keci|kucukbas|kuzu|davar|mera)/, 'haber_koyun.jpg'],
  [
    /\b(inek|sut |sigir|buyukbas|buzagi|besi|hayvan|veteriner|sap |sarbon|bruselloz)/,
    'haber_inek.jpg',
  ],
  [/\b(fistik|fistig)/, 'haber_fistik.jpg'],
  [/\b(zeytin)/, 'haber_zeytin.jpg'],
  [/\b(kiraz|visne|kayisi|seftali|erik)/, 'haber_kiraz.jpg'],
  [/\b(findik|findig)/, 'haber_findik.jpg'],
  [/\b(cay\b|cay )/, 'haber_cay.jpg'],
  [/\b(uzum|asma|bag |baglari|sarap)/, 'haber_uzum.jpg'],
  [/\b(limon|portakal|mandalina|narenciye|turuncgil|greyfurt)/, 'haber_narenciye.jpg'],
  [/\b(pamuk)/, 'haber_pamuk.jpg'],
  [/\b(aycicegi|yaglik)/, 'haber_aycicegi.jpg'],
  [/\b(patates|sogan)/, 'haber_patates.jpg'],
  [/\b(nohut|mercimek|fasulye|bakliyat)/, 'haber_bakliyat.jpg'],
  [/\b(domates|biber|patlican|salatalik|sebze|sera|ortu alti)/, 'haber_sera.jpg'],
  [/\b(bugday|arpa|hububat|cavdar|yulaf|tahil|bicerdover|un )/, 'haber_bugday.jpg'],
  [/\b(elma|armut|ceviz|badem|meyve|fidan|bahce)/, 'haber_meyve.jpg'],
  [/\b(zirai don|don |dolu|saskin|soguk hava|kiragi)/, 'haber_don.jpg'],
  [/\b(kuraklik|kurak|su kitligi|yagis azligi)/, 'haber_kuraklik.jpg'],
  [/\b(sulama|damla|baraj|kanal|havza|su kaynak|kuyu)/, 'haber_sulama.jpg'],
  [/\b(gubre|toprak analiz|tohum)/, 'genis_gubre.jpg'],
  [/\b(drone|dijital|sensor|uydu|teknoloji|robot|yapay zeka|akilli tarim)/, 'kart_3.jpg'],
  [/\b(egitim|toplanti|seminer|calistay|bilgilendirme|tanitim|ziyaret)/, 'genis_ciftciler.jpg'],
  [/\b(hibe|destek|basvuru|kredi|odeme|dagitim)/, 'genis_hizmet.jpg'],
];

const KATEGORI: Record<string, ImageName> = {
  onlem: 'haber_don.jpg',
  teknoloji: 'kart_3.jpg',
  yonlendirme: 'genis_hizmet.jpg',
  bilgilendirme: 'genis_ciftciler.jpg',
};

/** Konu ya da kategoriyle eşleşen görsel; hiçbiri eşleşmezse null. */
export function haberGorselEslesen(a: {
  title: string;
  body?: string | null;
  category?: string | null;
}): ImageName | null {
  const baslik = ` ${sadelestir(a.title)} `;
  const tam = ` ${baslik} ${sadelestir((a.body ?? '').slice(0, 600))} `;
  for (const [re, ad] of KURALLAR) if (re.test(baslik)) return ad;
  for (const [re, ad] of KURALLAR) if (re.test(tam)) return ad;
  return (a.category && KATEGORI[a.category]) || null;
}

/** Duyuru metninden (başlık öncelikli) konuya uygun kütüphane görseli; eşleşme yoksa genel tarla. */
export function haberGorselAdi(a: Parameters<typeof haberGorselEslesen>[0]): ImageName {
  return haberGorselEslesen(a) ?? 'genis_tarla.jpg';
}

/** Kütüphane görselinin atıf notu (CC BY / BY-SA şartı); kütüphane dışı görsel için null. */
export function haberGorselNotu(ad: string): string | null {
  const m = /^haber_(.+)\.jpg$/.exec(ad);
  const k = m ? (KAYNAKLAR as Record<string, { yazar: string; lisans: string }>)[m[1]!] : undefined;
  if (!k) return null;
  return `Fotoğraf: ${k.yazar ? `${k.yazar}, ` : ''}Wikimedia Commons (${k.lisans}).`;
}
