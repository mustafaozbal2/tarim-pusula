import type { ConnectionMethod, DeviceKind } from '@tarim/schemas';

/** Bir cihazdan gelen tek ölçüm. Birimler sabit: nem m³/m³ (0..1), sıcaklık °C. */
export interface DeviceReading {
  /** ISO zamanı (UTC). */
  at: string;
  metric: 'soil-moisture' | 'soil-temp' | 'air-temp' | 'rain' | 'flow-m3';
  value: number;
  unit: 'm3/m3' | 'C' | 'mm' | 'm3';
}

/** Her adaptörün künyesi: üretici/model/kaynak/sürüm saklanır (değişmez kural 6). */
export interface AdapterInfo {
  id: string;
  label: string;
  method: ConnectionMethod;
  kinds: readonly DeviceKind[];
  /** Adaptör arayüzünün sürümü (cihaz kaydına yazılır). */
  version: string;
  /** Sahte sağlayıcı mı (gerçek çağrı yok)? Arayüzde "örnek" etiketi taşır. */
  fake: boolean;
  /** Anahtar/OAuth gerekir mi; gerekiyorsa yalnız SUNUCUDA .env içinde tutulur. */
  requiresServerKey: boolean;
  /** Anahtarın okunduğu ortam değişkeni adı (yalnız sunucu). */
  keyEnvVar?: string;
  licenseNote: string;
}

export interface ConnectRequest {
  kind: DeviceKind;
  /** Eşleştirme kodu / hesap bağlantı kodu. */
  pairingCode?: string;
  /** CSV metni (csv-elle yöntemi). */
  csv?: string;
  manufacturer?: string;
  model?: string;
}

export type ConnectResult =
  | {
      ok: true;
      /** Cihazın dış kimliği (eşleştirme kodu, bulut cihaz no). */
      externalId: string | null;
      readings: DeviceReading[];
      /** Kullanıcıya gösterilecek kısa durum. */
      message: string;
    }
  | { ok: false; reason: string };

/** Bağlantı yöntemi adaptörü. Gerçek üretici API'si sözleşme/izin gerektirdiğinde yalnız sahtesi yazılır. */
export interface DeviceAdapter {
  readonly info: AdapterInfo;
  connect(req: ConnectRequest): Promise<ConnectResult>;
  /** Son ölçümler (yoksa boş). */
  readLatest(externalId: string): Promise<DeviceReading[]>;
}
