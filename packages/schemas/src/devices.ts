import { z } from 'zod';

/** Arazi başına eklenebilen cihaz türleri (G21). `sulama` eski kayıtlarla uyumlu varsayılandır. */
export const DEVICE_KINDS = [
  'sulama',
  'nem-sensoru',
  'hava-istasyonu',
  'drone',
  'ilaclama',
  'diger',
] as const;
export const deviceKindSchema = z.enum(DEVICE_KINDS);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  sulama: 'Sulama kontrol cihazı',
  'nem-sensoru': 'Toprak nem/sıcaklık sensörü',
  'hava-istasyonu': 'Hava istasyonu',
  drone: 'Drone',
  ilaclama: 'Pülverizatör / ilaçlama',
  diger: 'Diğer',
};

/**
 * Bağlantı yöntemi = bir ADAPTÖR (packages/devices). Gerçek üretici API'leri sözleşme/izin
 * gerektirir: izin yokken yalnız arayüz + sahte sağlayıcı vardır (uydurma uç nokta yok).
 */
export const CONNECTION_METHODS = ['eslestirme-kodu', 'uretici-bulutu', 'csv-elle'] as const;
export const connectionMethodSchema = z.enum(CONNECTION_METHODS);
export type ConnectionMethod = z.infer<typeof connectionMethodSchema>;

export const CONNECTION_METHOD_LABELS: Record<ConnectionMethod, string> = {
  'eslestirme-kodu': 'Eşleştirme kodu / QR (kendi cihazımız, MQTT)',
  'uretici-bulutu': 'Üretici bulutu (hesap ile bağlan)',
  'csv-elle': 'CSV dosyası / elle giriş',
};

/** Her tür için sunulan bağlantı yöntemleri. */
export const KIND_METHODS: Record<DeviceKind, readonly ConnectionMethod[]> = {
  sulama: ['eslestirme-kodu', 'uretici-bulutu'],
  'nem-sensoru': ['eslestirme-kodu', 'uretici-bulutu', 'csv-elle'],
  'hava-istasyonu': ['uretici-bulutu', 'csv-elle'],
  drone: ['uretici-bulutu', 'csv-elle'],
  ilaclama: ['uretici-bulutu', 'csv-elle'],
  diger: ['csv-elle'],
};

/** Cihaz eklemek için gönderilen gövde. Üretici/model/kaynak künyesi saklanır (değişmez kural 6). */
export const deviceRegisterSchema = z.object({
  fieldId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  kind: deviceKindSchema,
  method: connectionMethodSchema,
  manufacturer: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  /** Yöntem eşleştirme kodu ise cihazın kodu; üretici bulutunda hesap anahtarı SUNUCUDA tutulur. */
  pairingCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,32}$/, 'Eşleştirme kodu 6-32 harf/rakam olmalı')
    .optional(),
  providerId: z.string().trim().max(40).optional(),
});
export type DeviceRegister = z.infer<typeof deviceRegisterSchema>;

/** Cihaz yeteneği: arayüzde hangi kartların açılacağını belirler (mod seçimi YOK). */
export const CAPABILITIES = [
  'sulama-karti',
  'nem-grafigi',
  'nem-hatirlaticisi',
  'drone-gorevi',
  'hava-istasyonu-verisi',
  'ilaclama-kaydi',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const KIND_CAPABILITIES: Record<DeviceKind, readonly Capability[]> = {
  sulama: ['sulama-karti'],
  'nem-sensoru': ['nem-grafigi', 'nem-hatirlaticisi'],
  'hava-istasyonu': ['hava-istasyonu-verisi'],
  drone: ['drone-gorevi'],
  ilaclama: ['ilaclama-kaydi'],
  diger: [],
};

/** Aracın türlerinden yetenekler (yinelenmeden, sabit sırada). Cihaz yoksa boş: yalnız ana sayfa içerikleri. */
export function capabilitiesFor(kinds: readonly string[]): Capability[] {
  const set = new Set<Capability>();
  for (const k of kinds) {
    const caps = KIND_CAPABILITIES[k as DeviceKind];
    if (caps) for (const c of caps) set.add(c);
  }
  return CAPABILITIES.filter((c) => set.has(c));
}

export function isDeviceKind(k: string): k is DeviceKind {
  return (DEVICE_KINDS as readonly string[]).includes(k);
}
