import type { Capability } from '@tarim/schemas';
import type { ImageName } from '../assets';
import type { IconName } from '../components/Icon';

export interface HubCard {
  key: string;
  title: string;
  hint: string;
  route: string;
  /** Hangi cihaz yeteneği bu kartı açtı; her zaman açık kartta yok. */
  capability?: Capability;
  /** Kart görseli (images/) ya da çizgi ikon (G23: çocuğun anlayacağı resimli kartlar). */
  image?: ImageName;
  icon?: IconName;
}

/** Her arazide görünen kartlar (ana sayfa içerikleri ve hesaplar). */
const ALWAYS: HubCard[] = [
  {
    key: 'plan',
    image: 'ikon_konum.png',
    title: 'Üretim planı',
    hint: 'Ürünün işleri ve satış',
    route: '/uretim-plani',
  },
  {
    key: 'takvim',
    icon: 'calendar',
    title: 'Tarla takvimi',
    hint: 'Ay ay yapılacak işler',
    route: '/takvim',
  },
  {
    key: 'hatirlatici',
    icon: 'bell',
    title: 'Sulama hatırlatıcıları',
    hint: 'Günlük su ihtiyacı ve nem eşiği',
    route: '/hatirlaticilar',
  },
  {
    key: 'ndvi',
    image: 'ikon_verim_haritasi.png',
    title: 'Bitki yeşilliği',
    hint: 'Uydu ile haftalık durum',
    route: '/ndvi',
  },
  {
    key: 'tasarruf',
    image: 'ikon_rapor.png',
    title: 'Tasarruf ve verim raporu',
    hint: 'Geleneksel sulama ile karşılaştırma',
    route: '/tasarruf',
  },
  { key: 'pazar', icon: 'chart', title: 'Pazar', hint: 'Fiyat ve nerede satarım', route: '/pazar' },
  {
    key: 'kc',
    icon: 'drop',
    title: 'Bitkinin su ihtiyacı',
    hint: 'Bitkin ne kadar su içer?',
    route: '/kc-listesi',
  },
  {
    key: 'toprak',
    image: 'ikon_toprak.png',
    title: 'Toprak türleri',
    hint: 'Toprağın suyu ne kadar tutar?',
    route: '/toprak-turleri',
  },
  {
    key: 'cihaz',
    image: 'ikon_cihaz.png',
    title: 'Cihaz ekle',
    hint: 'Sulama, sensör, drone ve diğerleri',
    route: '/cihaz-ekle',
  },
];

/** Cihaz yeteneğiyle açılan kartlar: sayfa kendiliğinden gelişir, mod seçimi yoktur. */
const BY_CAPABILITY: Record<Capability, HubCard> = {
  'sulama-karti': {
    key: 'sulama',
    icon: 'drop',
    title: 'Sulama',
    hint: 'Vanayı aç ve kapat',
    route: '/sulama',
    capability: 'sulama-karti',
  },
  'nem-grafigi': {
    key: 'nem',
    icon: 'chart',
    title: 'Toprak nemi',
    hint: 'Sensör ölçümleri',
    route: '/cihazlar',
    capability: 'nem-grafigi',
  },
  'nem-hatirlaticisi': {
    key: 'nem-hatirlatici',
    icon: 'bell',
    title: 'Nem eşiği hatırlatıcısı',
    hint: 'Nem kritik seviyeye inince haber ver',
    route: '/hatirlaticilar',
    capability: 'nem-hatirlaticisi',
  },
  'drone-gorevi': {
    key: 'drone',
    icon: 'target',
    title: 'Drone görevi',
    hint: 'Verim haritası ve NDVI görevi',
    route: '/verim-haritasi',
    capability: 'drone-gorevi',
  },
  'hava-istasyonu-verisi': {
    key: 'istasyon',
    image: 'ikon_hava.png',
    title: 'Hava istasyonu',
    hint: 'Tarladaki ölçüm',
    route: '/hava',
    capability: 'hava-istasyonu-verisi',
  },
  'ilaclama-kaydi': {
    key: 'ilaclama',
    icon: 'book',
    title: 'İlaçlama kaydı',
    hint: 'Uygulama kaydı (doz önerisi yok)',
    route: '/cihazlar',
    capability: 'ilaclama-kaydi',
  },
};

/** Arazi İşlemleri kartları: cihaz kartları üstte, sonra her zaman açık olanlar. */
export function hubCards(capabilities: readonly Capability[]): HubCard[] {
  const dynamic = capabilities.map((c) => BY_CAPABILITY[c]);
  const seen = new Set<string>();
  return [...dynamic, ...ALWAYS].filter((c) => !seen.has(c.key) && !!seen.add(c.key));
}
