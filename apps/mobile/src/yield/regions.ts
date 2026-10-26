/**
 * Verim Haritası (G23.11): ilin coğrafi bölgesi ve bölgede yaygın yetişen ürünler. Bölge eşlemesi Türkiye'nin
 * 7 coğrafi bölgesidir (81 il). Ürün listesi genel bilgidir; il bazında üretim/verim rakamı DEĞİLDİR ve
 * ekranda "Örnek veri" etiketiyle gösterilir. TÜİK il bazlı bitkisel üretim verisi bağlanınca yerini alır.
 */
export type RegionId =
  'marmara' | 'ege' | 'akdeniz' | 'icanadolu' | 'karadeniz' | 'dogu' | 'guneydogu';

export const REGIONS: Record<RegionId, { name: string; crops: string[]; provinces: string[] }> = {
  marmara: {
    name: 'Marmara Bölgesi',
    crops: ['aycicegi', 'bugday', 'kayisi-seftali', 'domates', 'misir-tane', 'zeytin'],
    provinces: [
      'Edirne',
      'Kırklareli',
      'Tekirdağ',
      'İstanbul',
      'Kocaeli',
      'Yalova',
      'Sakarya',
      'Bilecik',
      'Bursa',
      'Balıkesir',
      'Çanakkale',
    ],
  },
  ege: {
    name: 'Ege Bölgesi',
    crops: ['zeytin', 'incir', 'uzum-sofralik', 'pamuk', 'domates', 'misir-tane'],
    provinces: [
      'İzmir',
      'Manisa',
      'Aydın',
      'Denizli',
      'Muğla',
      'Uşak',
      'Kütahya',
      'Afyonkarahisar',
    ],
  },
  akdeniz: {
    name: 'Akdeniz Bölgesi',
    crops: ['narenciye-yuzde70', 'domates', 'pamuk', 'cilek', 'elma-kiraz-armut', 'bugday'],
    provinces: [
      'Antalya',
      'Isparta',
      'Burdur',
      'Mersin',
      'Adana',
      'Hatay',
      'Osmaniye',
      'Kahramanmaraş',
    ],
  },
  icanadolu: {
    name: 'İç Anadolu Bölgesi',
    crops: ['bugday', 'arpa', 'seker-pancari', 'patates', 'nohut', 'elma-kiraz-armut'],
    provinces: [
      'Ankara',
      'Konya',
      'Karaman',
      'Aksaray',
      'Niğde',
      'Nevşehir',
      'Kırşehir',
      'Kırıkkale',
      'Kayseri',
      'Sivas',
      'Yozgat',
      'Çankırı',
      'Eskişehir',
    ],
  },
  karadeniz: {
    name: 'Karadeniz Bölgesi',
    crops: ['findik', 'cay', 'misir-tane', 'fasulye', 'bugday', 'elma-kiraz-armut'],
    provinces: [
      'Bolu',
      'Düzce',
      'Zonguldak',
      'Karabük',
      'Bartın',
      'Kastamonu',
      'Sinop',
      'Samsun',
      'Amasya',
      'Çorum',
      'Tokat',
      'Ordu',
      'Giresun',
      'Trabzon',
      'Rize',
      'Artvin',
      'Gümüşhane',
      'Bayburt',
    ],
  },
  dogu: {
    name: 'Doğu Anadolu Bölgesi',
    crops: ['kayisi-seftali', 'arpa', 'bugday', 'yonca', 'seker-pancari', 'ceviz'],
    provinces: [
      'Erzurum',
      'Erzincan',
      'Kars',
      'Ardahan',
      'Iğdır',
      'Ağrı',
      'Van',
      'Muş',
      'Bitlis',
      'Bingöl',
      'Tunceli',
      'Elazığ',
      'Malatya',
      'Hakkari',
    ],
  },
  guneydogu: {
    name: 'Güneydoğu Anadolu Bölgesi',
    crops: ['antep-fistigi', 'pamuk', 'bugday', 'mercimek', 'uzum-sofralik', 'zeytin'],
    provinces: [
      'Gaziantep',
      'Kilis',
      'Şanlıurfa',
      'Adıyaman',
      'Diyarbakır',
      'Mardin',
      'Batman',
      'Siirt',
      'Şırnak',
    ],
  },
};

/** Türkçe harflere duyarsız il adı ("Istanbul" ~ "İstanbul", "Canakkale" ~ "Çanakkale", "Hakkâri"). */
export const foldProvince = (s: string) =>
  s
    .replace(/[İI]/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/â/g, 'a')
    .trim();
const fold = foldProvince;

/** İlin bölgesi; bilinmeyen il için null. */
export function regionOf(province: string | null | undefined): RegionId | null {
  if (!province) return null;
  const p = fold(province);
  for (const [id, r] of Object.entries(REGIONS) as [RegionId, (typeof REGIONS)[RegionId]][]) {
    if (r.provinces.some((x) => fold(x) === p)) return id;
  }
  return null;
}

/**
 * Buğday verimi karşılaştırması (kg/hektar). Kaynak: TÜİK (2022), "Türkiye Tarımsal Üretim
 * İstatistikleri" (eski proje arşivi, Üretim İstatistikleri). Rakamlar kaynakta yazdığı gibidir.
 */
export const WHEAT_YIELD = {
  source: 'TÜİK (2022), Türkiye Tarımsal Üretim İstatistikleri',
  rows: [
    { label: 'Fransa', kgPerHa: 7599.2 },
    { label: 'Almanya', kgPerHa: 7328.3 },
    { label: 'AB ortalaması', kgPerHa: 5342.4 },
    { label: 'Türkiye', kgPerHa: 2669.5 },
  ],
} as const;

/** kg/hektar -> kg/dekar (1 hektar = 10 dekar). */
export const perDecare = (kgPerHa: number) => kgPerHa / 10;
