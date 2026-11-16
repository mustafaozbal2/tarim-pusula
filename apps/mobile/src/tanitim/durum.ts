import { useSyncExternalStore } from 'react';
import type { KV } from '../offline/kv';

/**
 * Tanıtım durumu: karşılama kartı görüldü mü, hangi sayfaların turu görüldü, şu an açık tur hangisi.
 * Kalıcı kısım cihaz deposundadır: çiftçi bir sayfanın turunu bir kez görür; sonra yalnız mavi ampule
 * dokununca yeniden açılır.
 */
export const KARSILAMA_ANAHTARI = 'tanitim.karsilama.v1';
export const SAYFA_ANAHTARI = 'tanitim.sayfalar.v1';

export interface TanitimDurumu {
  /** Depo okundu mu (okunmadan hiçbir şey kendiliğinden açılmaz). */
  hazir: boolean;
  karsilamaGoruldu: boolean;
  gorulenSayfalar: string[];
  /** Açık tur: sayfa anahtarı ve adım sırası. */
  acik: { sayfa: string; adim: number } | null;
  /** Karşılama kartı açık mı. */
  karsilamaAcik: boolean;
}

let durum: TanitimDurumu = {
  hazir: false,
  karsilamaGoruldu: false,
  gorulenSayfalar: [],
  acik: null,
  karsilamaAcik: false,
};
const dinleyiciler = new Set<() => void>();
let depo: KV | null = null;

function yay(yeni: Partial<TanitimDurumu>): void {
  durum = { ...durum, ...yeni };
  for (const d of dinleyiciler) d();
}

export function tanitimDurumu(): TanitimDurumu {
  return durum;
}

export function useTanitim(): TanitimDurumu {
  return useSyncExternalStore(
    (d) => {
      dinleyiciler.add(d);
      return () => dinleyiciler.delete(d);
    },
    tanitimDurumu,
    tanitimDurumu,
  );
}

function dizi(ham: string | null): string[] {
  if (!ham) return [];
  try {
    const v = JSON.parse(ham) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Depodan okur (uygulama açılışında bir kez). Okuma hatası turu engellemez: "görülmedi" sayılır. */
export async function tanitimYukle(kv: KV): Promise<void> {
  depo = kv;
  let karsilama = false;
  let sayfalar: string[] = [];
  try {
    karsilama = (await kv.get(KARSILAMA_ANAHTARI)) === '1';
    sayfalar = dizi(await kv.get(SAYFA_ANAHTARI));
  } catch {
    // depo okunamadı: tur yeniden gösterilir, veri kaybı yok
  }
  yay({ hazir: true, karsilamaGoruldu: karsilama, gorulenSayfalar: sayfalar });
}

export function karsilamaAc(): void {
  yay({ karsilamaAcik: true, acik: null });
}

export function karsilamaKapat(): void {
  yay({ karsilamaAcik: false, karsilamaGoruldu: true });
  void depo?.set(KARSILAMA_ANAHTARI, '1').catch(() => undefined);
}

/** Sayfa turunu açar (ilk girişte kendiliğinden, sonra mavi ampulle). */
export function turAc(sayfa: string): void {
  yay({ acik: { sayfa, adim: 0 }, karsilamaAcik: false });
}

export function turAdim(adim: number): void {
  if (!durum.acik) return;
  yay({ acik: { ...durum.acik, adim } });
}

/** Turu kapatır ve sayfayı "görüldü" sayar (yarıda bırakılsa da bir daha kendiliğinden açılmaz). */
export function turKapat(): void {
  const sayfa = durum.acik?.sayfa;
  if (!sayfa) return;
  const gorulen = durum.gorulenSayfalar.includes(sayfa)
    ? durum.gorulenSayfalar
    : [...durum.gorulenSayfalar, sayfa];
  yay({ acik: null, gorulenSayfalar: gorulen });
  void depo?.set(SAYFA_ANAHTARI, JSON.stringify(gorulen)).catch(() => undefined);
}

/** Ayarlar > "Tanıtımı baştan göster": bütün sayfalar yeniden ilk giriş gibi anlatılır. */
export async function tanitimSifirla(): Promise<void> {
  yay({ karsilamaGoruldu: false, gorulenSayfalar: [], acik: null, karsilamaAcik: false });
  try {
    await depo?.remove(KARSILAMA_ANAHTARI);
    await depo?.remove(SAYFA_ANAHTARI);
  } catch {
    // bellekteki durum yine sıfırlandı
  }
}

/** Yalnız test: bellekteki durumu başa alır. */
export function tanitimTestSifirla(): void {
  depo = null;
  durum = {
    hazir: false,
    karsilamaGoruldu: false,
    gorulenSayfalar: [],
    acik: null,
    karsilamaAcik: false,
  };
}
