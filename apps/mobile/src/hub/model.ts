import type { Capability } from '@tarim/schemas';

export interface HubCard {
  key: string;
  title: string;
  hint: string;
  route: string;
  /** Hangi cihaz yeteneği bu kartı açtı; her zaman açık kartta yok. */
  capability?: Capability;
}

/** Her arazide görünen kartlar (ana sayfa içerikleri ve hesaplar). */
const ALWAYS: HubCard[] = [
  { key: 'plan', title: 'Üretim planı', hint: 'Ürünün işleri ve satış', route: '/uretim-plani' },
  { key: 'takvim', title: 'Tarla takvimi', hint: 'Ay ay yapılacak işler', route: '/takvim' },
  {
    key: 'hatirlatici',
    title: 'Sulama hatırlatıcıları',
    hint: 'Günlük su ihtiyacı ve nem eşiği',
    route: '/hatirlaticilar',
  },
  { key: 'ndvi', title: 'Bitki yeşilliği', hint: 'Uydu ile haftalık durum', route: '/ndvi' },
  {
    key: 'tasarruf',
    title: 'Tasarruf ve verim raporu',
    hint: 'Geleneksel sulama ile karşılaştırma',
    route: '/tasarruf',
  },
  { key: 'pazar', title: 'Pazar', hint: 'Fiyat ve nerede satarım', route: '/pazar' },
  { key: 'kc', title: 'Bitki Kc listesi', hint: 'Su ihtiyacı katsayıları', route: '/kc-listesi' },
  {
    key: 'toprak',
    title: 'Toprak türleri',
    hint: 'Su tutma değerleri',
    route: '/toprak-turleri',
  },
  {
    key: 'cihaz',
    title: 'Cihaz ekle',
    hint: 'Sulama, sensör, drone ve diğerleri',
    route: '/cihaz-ekle',
  },
];

/** Cihaz yeteneğiyle açılan kartlar: sayfa kendiliğinden gelişir, mod seçimi yoktur. */
const BY_CAPABILITY: Record<Capability, HubCard> = {
  'sulama-karti': {
    key: 'sulama',
    title: 'Sulama',
    hint: 'Vanayı aç ve kapat',
    route: '/sulama',
    capability: 'sulama-karti',
  },
  'nem-grafigi': {
    key: 'nem',
    title: 'Toprak nemi',
    hint: 'Sensör grafiği',
    route: '/nem',
    capability: 'nem-grafigi',
  },
  'nem-hatirlaticisi': {
    key: 'nem-hatirlatici',
    title: 'Nem eşiği hatırlatıcısı',
    hint: 'Nem kritik seviyeye inince haber ver',
    route: '/hatirlaticilar',
    capability: 'nem-hatirlaticisi',
  },
  'drone-gorevi': {
    key: 'drone',
    title: 'Drone görevi',
    hint: 'Verim haritası ve NDVI görevi',
    route: '/verim-haritasi',
    capability: 'drone-gorevi',
  },
  'hava-istasyonu-verisi': {
    key: 'istasyon',
    title: 'Hava istasyonu',
    hint: 'Tarladaki ölçüm',
    route: '/hava',
    capability: 'hava-istasyonu-verisi',
  },
  'ilaclama-kaydi': {
    key: 'ilaclama',
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
