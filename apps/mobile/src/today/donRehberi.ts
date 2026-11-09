/**
 * "Neler yapabilirim?" don bilgi notu. Yalnız kaynaklı, genel yöntemler (ilaç, doz, miktar yok; kural 2).
 * Uzman onayından geçmediği için ekranda "Bilgi notu · uzman onayı bekliyor" rozetiyle gösterilir ve
 * bildirim/komut üretmez (kural 1).
 *
 * Ana kaynak: Snyder, R.L. & de Melo-Abreu, J.P. (2005). Frost Protection: fundamentals, practice and
 * economics. Cilt 1. FAO Environment and Natural Resources Series 10, Roma. (FAO 2005)
 */
export interface DonYontemi {
  baslik: string;
  metin: string;
  /** Yalnız bu don türünde işe yarar (yoksa her durumda). */
  tur?: 'radyasyon' | 'adveksiyon';
  kaynak: string;
}

export interface DonRehberi {
  grup: string;
  giris: string;
  hemen: DonYontemi[];
  sonra: DonYontemi[];
  yapmayin: DonYontemi[];
  kaynaklar: string[];
}

const FAO = 'FAO 2005, Frost Protection, Cilt 1';
const KAYNAKLAR = [
  'Snyder R.L., de Melo-Abreu J.P. (2005). Frost Protection: fundamentals, practice and economics, Cilt 1. FAO, Roma.',
  'Atık Lastiklerin Kontrolü Yönetmeliği ve 2872 sayılı Çevre Kanunu (açıkta yakma yasağı).',
  'TARSİM (Tarım Sigortaları Havuzu): bitkisel ürün sigortası don teminatı.',
];

const AGAC = new Set([
  'antep-fistigi',
  'zeytin',
  'elma-kiraz-armut',
  'elma-kiraz-armut-ortulu',
  'kayisi-seftali',
  'kayisi-seftali-ortulu',
  'badem',
  'ceviz',
  'incir',
  'nar',
  'findik',
  'cay',
  'narenciye-yuzde20',
  'narenciye-yuzde50',
  'narenciye-yuzde70',
  'uzum',
]);
const HEP_YESIL = new Set([
  'zeytin',
  'narenciye-yuzde20',
  'narenciye-yuzde50',
  'narenciye-yuzde70',
  'cay',
]);

const ORTAK_HEMEN: DonYontemi[] = [
  {
    baslik: 'Toprağı gündüzden nemlendirin',
    metin:
      'Nemli toprak gündüz daha çok ısı depolar ve geceleyin yavaş yavaş geri verir. Don beklenen günden önce sulama yapılabilir; gece sulamayı yarıda kesmeyin.',
    kaynak: FAO,
  },
  {
    baslik: 'Ağaç ve sıra arasındaki otları kısa tutun',
    metin:
      'Uzun ot ve örtü bitkisi toprağın ısısının yükselmesini engeller; kısa biçilmiş, çıplak ve sıkı toprak geceleyin daha çok ısı verir.',
    kaynak: FAO,
  },
  {
    baslik: 'Don öncesi toprağı sürmeyin',
    metin:
      'Yeni sürülmüş, gevşek toprak daha az ısı iletir ve yüzey daha soğuk kalır. Sürümü don tehlikesi geçince yapın.',
    kaynak: FAO,
  },
  {
    baslik: 'Soğuk havanın yolunu açın',
    metin:
      'Soğuk hava ağırdır, çukurlara ve alçak köşelere akar. Bahçenin alt ucundaki sık çit veya yığın soğuk havayı tutar; mümkünse açıklık bırakın.',
    tur: 'radyasyon',
    kaynak: FAO,
  },
];

export function donRehberi(
  cropId: string | null | undefined,
  tur: 'radyasyon' | 'adveksiyon' | 'karisik' | null,
): DonRehberi {
  const agac = !!cropId && AGAC.has(cropId);
  const yesil = !!cropId && HEP_YESIL.has(cropId);
  const hemen: DonYontemi[] = [...ORTAK_HEMEN];
  if (agac) {
    hemen.push({
      baslik: 'Genç fidanları örtün',
      metin:
        'Genç fidan ve aşılı ağaçlar daha hassastır. Gövde ve taç akşam örtüyle (tülbent, agril) sarılabilir; örtü toprağa kadar inerse topraktan gelen ısıyı tutar.',
      kaynak: FAO,
    });
    hemen.push({
      baslik: 'Rüzgâr pervanesi yalnız durgun gecede işe yarar',
      metin:
        'Pervane, yukarıdaki ılık havayı aşağı indirir. Bu yalnız açık ve durgun gecede (radyasyon donu) olur; rüzgârlı, soğuk hava gelen gecede faydası azdır.',
      tur: 'radyasyon',
      kaynak: FAO,
    });
    hemen.push({
      baslik: 'Yağmurlama ile koruma kesintisiz olmalı',
      metin:
        'Ağaç üstü yağmurlama, donan suyun bıraktığı ısıyla korur. Sıcaklık 0°in altına inmeden başlatılmalı ve buz tamamen eriyene kadar durdurulmamalıdır; yarıda kesilirse zarar artabilir. Sistem ve su yeterli değilse uygulanmamalıdır.',
      kaynak: FAO,
    });
  } else {
    hemen.push({
      baslik: 'Fide ve sebzeleri örtün',
      metin:
        'Akşam güneş batmadan örtü (tülbent, agril, naylon tünel) serin. Örtü yere kadar inmeli; yaprağa değen ince naylon az korur.',
      kaynak: FAO,
    });
  }
  if (tur === 'adveksiyon') {
    hemen.unshift({
      baslik: 'Bu gece rüzgârlı soğuk hava bekleniyor',
      metin:
        'Soğuk hava kütlesi rüzgârla geldiğinde örtü ve rüzgâr kırıcı korur; rüzgâr pervanesinin faydası azdır.',
      kaynak: FAO,
    });
  } else if (tur === 'radyasyon') {
    hemen.unshift({
      baslik: 'Bu gece açık ve durgun bir gece bekleniyor',
      metin:
        'Açık ve durgun gecede bitki yüzeyi havadan daha soğuk olabilir. Alçak, çukur yerler daha erken ve daha çok donar.',
      kaynak: FAO,
    });
  }
  const sonra: DonYontemi[] = [
    {
      baslik: 'Zararı hemen budamayın, bekleyin',
      metin: yesil
        ? 'Donan yaprak ve sürgünler birkaç hafta içinde belli olur. Canlı ve ölü dokuyu ayırt etmek için bekleyin; budama ve uygulamalar için ilçe tarım müdürlüğüne ya da ziraat mühendisine danışın.'
        : 'Çiçek ve tomurcuk zararı birkaç gün sonra kesitte kararma olarak görülür. Zararı birkaç gün sonra kontrol edin; ne yapılacağına ilçe tarım müdürlüğü ya da ziraat mühendisiyle karar verin.',
      kaynak: FAO,
    },
    {
      baslik: 'Zararı bildirin',
      metin:
        'Ürününüz TARSİM sigortalıysa zararı süresi içinde bildirin. İlçe tarım müdürlüğü zarar tespiti yapar.',
      kaynak: 'TARSİM',
    },
  ];
  const yapmayin: DonYontemi[] = [
    {
      baslik: 'Lastik, plastik ya da çöp yakmayın',
      metin:
        'Zehirli duman insan ve hayvan sağlığına zarar verir, toprağı ve ürünü kirletir; açıkta lastik ve atık yakmak yasaktır. Isıtma gerekiyorsa dumansız, bu iş için yapılmış ısıtıcılar kullanılır.',
      kaynak: 'Atık Lastiklerin Kontrolü Yönetmeliği; 2872 sayılı Çevre Kanunu; FAO 2005',
    },
    {
      baslik: 'İlaç ya da gübre "dona karşı" diye karıştırmayın',
      metin:
        'İlaç ve gübre kullanımına ziraat mühendisi ve ürün etiketi yol gösterir; uygulama bunu belirlemez.',
      kaynak: 'Bitki Koruma Ürünleri mevzuatı (BKÜ)',
    },
  ];
  const secili = (y: DonYontemi[]) =>
    y.filter((x) => !x.tur || !tur || tur === 'karisik' || x.tur === tur);
  return {
    grup: agac ? 'Ağaç ve bahçe' : 'Tarla ve sebze',
    giris:
      'Aşağıdakiler üreticilerin dona karşı kullandığı, kaynağı belli genel yöntemlerdir. Arazinize uygun olanı ilçe tarım müdürlüğü ya da ziraat mühendisiyle birlikte seçin.',
    hemen: secili(hemen),
    sonra,
    yapmayin,
    kaynaklar: KAYNAKLAR,
  };
}
