/** Türkçe metinler. Çiftçi dili: kısa cümle, jargon yok, emoji yok. */
export const tr = {
  app: { name: 'Tarım Pusula', slogan: 'Bilinçli Tarım, Verimli Üretim' },
  tabs: {
    today: 'Bugün',
    fields: 'Tarlalarım',
    ask: 'Soru sor',
    market: 'Pazar',
  },
  common: {
    sampleData: 'Örnek veri',
    source: 'Kaynak',
    why: 'Neden?',
    notifications: 'Bildirimler',
  },
  today: {
    currentField: 'Burç Köyü Fıstık Bahçesi',
    weather: 'Bugün hava parçalı bulutlu',
    attention: 'DİKKAT',
    frostTitle: 'Cuma gecesi don bekleniyor',
    frostBody: 'Çiçek gözleri zarar görebilir. Önlem almak için başla.',
    frostAction: 'Ne yapmalıyım?',
    frostSource: 'Kaynak: Gaziantep İl Tarım Müdürlüğü',
    fertilizer: 'Gübre zamanı geldi',
    irrigation: 'Sulama: bugün bekle',
    askByVoice: 'Sesle sor',
    takePhoto: 'Fotoğraf çek',
  },
  fields: {
    title: 'Tarlalarım',
    add: 'Tarla ekle',
    items: [
      { name: 'Burç Köyü Bahçesi', detail: 'Antep fıstığı · 24 dekar', status: 'Don uyarısı var' },
      { name: 'Yayla Zeytinliği', detail: 'Zeytin · 12 dekar', status: 'Her şey yolunda' },
    ],
  },
  ask: {
    title: 'Ne öğrenmek istiyorsun?',
    subtitle: 'Konuş, fotoğraf çek ya da yaz.',
    voice: 'Basılı tut ve konuş',
    photo: 'Fotoğraf çek',
    type: 'Yazarak sor',
    frequent: 'Sık sorulanlar',
    questions: ['Zeytin ne zaman budanır?', 'Don olacak, ne yapayım?'],
  },
  market: {
    title: 'Pazar',
    crops: ['Antep fıstığı', 'Zeytin', 'Buğday'],
    priceLabel: 'Bugünkü fiyat',
    price: '285 ₺',
    unit: 'kilo',
    trend: '3 ayda yükseldi',
    sampleNote: 'Örnek veri · Kaynak ve tarih canlıda yazılacak',
    whereTitle: 'Nerede satarım?',
    places: [
      { name: 'Ticaret Borsası', distance: '18 km uzakta', price: '285 ₺' },
      { name: 'Üretici kooperatifi', distance: '7 km uzakta', price: '278 ₺' },
    ],
  },
} as const;

export type Translations = typeof tr;
