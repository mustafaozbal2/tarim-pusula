/**
 * ÇKS (Çiftçi Kayıt Sistemi) bağlantısı — YALNIZ hazırlık (G20.4).
 * ÇKS resmi erişim izni ve protokol gerektirir. Bu izin olmadığı için GERÇEK ÇAĞRI YOKTUR:
 * yalnız adaptör arayüzü ve sahte sağlayıcı vardır. Resmi bağlantı onaylandığında gerçek adaptör
 * aynı arayüzü uygular. Kullanıcıya yalnız dürüst durum metni gösterilir.
 */
export type CksState = 'izin-bekleniyor' | 'hazir';

export interface CksStatus {
  state: CksState;
  /** Kullanıcıya gösterilen dürüst metin. */
  message: string;
  /** Gerçek bir ÇKS çağrısı yapılabiliyor mu? Bugün her zaman false. */
  live: false;
}

export interface CksParcel {
  /** Parsel kimliği ÖRNEKTİR; gerçek ÇKS verisi değildir. */
  ref: string;
  province: string;
  district: string;
  areaDecare: number;
  cropId: string | null;
}

export interface CksProvider {
  readonly id: string;
  readonly fake: boolean;
  status(): Promise<CksStatus>;
  /** Kullanıcının izniyle parsel listesi. İzin yokken boş ve gerçek çağrı yok. */
  listParcels(): Promise<CksParcel[]>;
}

export const CKS_PENDING_TEXT = 'Resmi bağlantı onaylandığında açılır.';

/** Sahte sağlayıcı: ağa hiç çıkmaz, parsel döndürmez (uydurma parsel verisi üretilmez). */
export class FakeCksProvider implements CksProvider {
  readonly id = 'cks-sahte';
  readonly fake = true;
  async status(): Promise<CksStatus> {
    return { state: 'izin-bekleniyor', message: CKS_PENDING_TEXT, live: false };
  }
  async listParcels(): Promise<CksParcel[]> {
    return [];
  }
}

/** Bugünkü sağlayıcı: her zaman sahte (resmi izin yok). */
export function getCksProvider(): CksProvider {
  return new FakeCksProvider();
}
