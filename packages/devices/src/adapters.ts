import type { ConnectionMethod, DeviceKind } from '@tarim/schemas';
import { CsvManualAdapter } from './csv';
import type {
  AdapterInfo,
  ConnectRequest,
  ConnectResult,
  DeviceAdapter,
  DeviceReading,
} from './types';

const ALL_KINDS: readonly DeviceKind[] = [
  'sulama',
  'nem-sensoru',
  'hava-istasyonu',
  'drone',
  'ilaclama',
  'diger',
];

/** Eşleştirme kodunu büyük harfe çevirir ve boşluk/tireyi sadeleştirir: "ab-12 cd" -> "AB-12CD". */
export function normalizePairingCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '').replace(/-+/g, '-');
}

/**
 * Kendi ESP32 cihazımız (MQTT): kullanıcı cihazdaki kodu girer ya da QR okutur. Gerçek eşleştirme
 * sunucuda `provision` ile yapılır (cihaz sırrı sunucuda üretilir); bu adaptör kod biçimini doğrular
 * ve cihazı "eşleştirme bekleniyor" olarak işaretler.
 */
export class PairingCodeAdapter implements DeviceAdapter {
  readonly info: AdapterInfo = {
    id: 'esp32-mqtt',
    label: 'Tarım Pusula cihazı (eşleştirme kodu / QR)',
    method: 'eslestirme-kodu',
    kinds: ['sulama', 'nem-sensoru'],
    version: '1.0.0',
    fake: false,
    requiresServerKey: false,
    licenseNote: 'Kendi donanımımız; sır yalnız sunucuda üretilir (AES-256-GCM).',
  };
  async connect(req: ConnectRequest): Promise<ConnectResult> {
    const code = normalizePairingCode(req.pairingCode ?? '');
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) {
      return { ok: false, reason: 'Eşleştirme kodu 6-32 harf/rakam olmalı' };
    }
    return {
      ok: true,
      externalId: code,
      readings: [],
      message: 'Cihaz eşleştirme bekliyor. Cihazı açıp internete bağla.',
    };
  }
  async readLatest(): Promise<DeviceReading[]> {
    return [];
  }
}

/**
 * Üretici bulutu arayüzü. Gerçek üretici API'leri sözleşme/izin ve anahtar gerektirir; anahtarlar
 * YALNIZ sunucu .env içinde tutulur. Anahtar yoksa ya da üretici doğrulanmadıysa sahte sağlayıcı
 * kullanılır (uydurma uç nokta YOK; docs/CIHAZ_ENTEGRASYON.md).
 */
export interface ManufacturerCloud extends DeviceAdapter {
  readonly info: AdapterInfo & { method: 'uretici-bulutu' };
}

/** Sahte üretici bulutu: belirlenimli örnek ölçüm üretir; "örnek" etiketlidir. */
export class FakeManufacturerCloud implements ManufacturerCloud {
  readonly info: AdapterInfo & { method: 'uretici-bulutu' } = {
    id: 'ornek-bulut',
    label: 'Örnek üretici bulutu (sahte sağlayıcı)',
    method: 'uretici-bulutu',
    kinds: ALL_KINDS,
    version: '1.0.0',
    fake: true,
    requiresServerKey: false,
    licenseNote: 'Gerçek çağrı yapmaz; örnek veri üretir.',
  };
  constructor(private readonly now: () => Date = () => new Date()) {}
  async connect(req: ConnectRequest): Promise<ConnectResult> {
    const code = normalizePairingCode(req.pairingCode ?? '');
    if (code.length < 6)
      return { ok: false, reason: 'Hesap bağlantı kodu en az 6 karakter olmalı' };
    return {
      ok: true,
      externalId: `ornek-${code}`,
      readings: await this.readLatest(`ornek-${code}`),
      message: 'Örnek veri ile bağlandı (gerçek üretici bağlantısı değil).',
    };
  }
  async readLatest(externalId: string): Promise<DeviceReading[]> {
    // Dış kimlikten belirlenimli bir nem değeri: 0,18..0,32 m³/m³.
    let h = 0;
    for (const ch of externalId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const value = 0.18 + (h % 15) / 100;
    return [
      {
        at: this.now().toISOString(),
        metric: 'soil-moisture',
        value: Math.round(value * 1000) / 1000,
        unit: 'm3/m3',
      },
    ];
  }
}

export interface AdapterEnv {
  /** Sunucu ortamı (process.env); anahtar yoksa sahte sağlayıcıya düşülür. */
  [key: string]: string | undefined;
}

/**
 * Bağlantı yöntemi için adaptör seçer. Üretici bulutunda anahtar tanımlı bir gerçek sağlayıcı
 * kaydı olmadığından bugün her zaman sahte sağlayıcı döner; gerçek sağlayıcı sözleşme sonrası
 * `REAL_CLOUDS` listesine eklenir.
 */
export const REAL_CLOUDS: ManufacturerCloud[] = [];

export function adapterFor(
  method: ConnectionMethod,
  env: AdapterEnv = {},
  providerId?: string,
): DeviceAdapter {
  switch (method) {
    case 'eslestirme-kodu':
      return new PairingCodeAdapter();
    case 'csv-elle':
      return new CsvManualAdapter();
    case 'uretici-bulutu': {
      const real = REAL_CLOUDS.find((c) => c.info.id === providerId);
      const key = real?.info.keyEnvVar ? env[real.info.keyEnvVar] : undefined;
      if (real && (!real.info.requiresServerKey || key)) return real;
      return new FakeManufacturerCloud();
    }
  }
}
