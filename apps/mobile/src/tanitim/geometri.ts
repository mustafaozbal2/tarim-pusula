import type { Dikdortgen } from './hedef';

/**
 * Tanıtım kartının yeri ve ok çizimi (saf hesap; testli). Kart hedefin altında ya da üstünde, hangisinde yer
 * çoksa orada durur; hedef yoksa ekranın ortasında. Ok karttan hedefe doğru kavisli çizilir.
 */
export interface KartYeri {
  x: number;
  y: number;
  /** Kart hedefin neresinde: altında, üstünde ya da (hedefsiz) ortada. */
  yon: 'alt' | 'ust' | 'orta';
  /** Ok çizilecek mi (hedef çok büyükse kart hedefin üstüne biner, ok çizilmez). */
  ok: boolean;
}

/** Kart ile hedef arasındaki boşluk: okun sığacağı yer. */
export const OK_BOSLUGU = 54;
const KENAR = 14;

export function kartYeri(
  hedef: Dikdortgen | null,
  ekran: { w: number; h: number },
  kart: { w: number; h: number },
  ustPay: number,
  altPay: number,
): KartYeri {
  const ortaX = Math.max(KENAR, (ekran.w - kart.w) / 2);
  if (!hedef) {
    return {
      x: ortaX,
      y: Math.max(ustPay + KENAR, (ekran.h - kart.h) / 2),
      yon: 'orta',
      ok: false,
    };
  }
  const hedefOrta = hedef.x + hedef.w / 2;
  const x = Math.min(
    Math.max(KENAR, hedefOrta - kart.w / 2),
    Math.max(KENAR, ekran.w - kart.w - KENAR),
  );
  const altBos = ekran.h - altPay - (hedef.y + hedef.h);
  const ustBos = hedef.y - ustPay;
  const gerek = kart.h + OK_BOSLUGU + KENAR;
  if (altBos >= gerek && (altBos >= ustBos || ustBos < gerek)) {
    return { x, y: hedef.y + hedef.h + OK_BOSLUGU, yon: 'alt', ok: true };
  }
  if (ustBos >= gerek) {
    return { x, y: hedef.y - OK_BOSLUGU - kart.h, yon: 'ust', ok: true };
  }
  // Hedef ekranın çoğunu kaplıyor: kart, boşluğu çok olan uçta hedefin üstüne biner (ok yok).
  const y =
    altBos >= ustBos ? Math.max(ustPay + KENAR, ekran.h - altPay - kart.h - KENAR) : ustPay + KENAR;
  return { x: ortaX, y, yon: altBos >= ustBos ? 'alt' : 'ust', ok: false };
}

export interface OkCizimi {
  /** Kavisli gövde (noktalı çizgi). */
  govde: string;
  /** Uçtaki dolu üçgen. */
  uc: string;
}

const yuvarla = (v: number) => Math.round(v * 10) / 10;

/** Karttan hedefe kavisli ok: başlangıç kartın hedefe bakan kenarı, bitiş hedefin kenarına 12 px kala. */
export function okYolu(hedef: Dikdortgen, yer: KartYeri, kart: { w: number; h: number }): OkCizimi {
  const hedefX = hedef.x + hedef.w / 2;
  const basX = Math.min(Math.max(yer.x + 30, hedefX), yer.x + kart.w - 30);
  const basY = yer.yon === 'alt' ? yer.y - 4 : yer.y + kart.h + 4;
  const bitY = yer.yon === 'alt' ? hedef.y + hedef.h + 14 : hedef.y - 14;
  // Kavis: ok düz inmek yerine yana doğru hafif yay çizer (el çizimi görünümü).
  const yan = hedefX > yer.x + kart.w / 2 ? -1 : 1;
  const egim = Math.abs(basX - hedefX) < 24 ? 26 * yan : 0;
  const kx = (basX + hedefX) / 2 + egim;
  const ky = (basY + bitY) / 2;
  // Uç üçgeni: kontrol noktasından bitişe bakan doğrultu.
  const aci = Math.atan2(bitY - ky, hedefX - kx);
  const boy = 11;
  const ac = 0.5;
  const solX = hedefX - boy * Math.cos(aci - ac);
  const solY = bitY - boy * Math.sin(aci - ac);
  const sagX = hedefX - boy * Math.cos(aci + ac);
  const sagY = bitY - boy * Math.sin(aci + ac);
  const ucX = hedefX + 4 * Math.cos(aci);
  const ucY = bitY + 4 * Math.sin(aci);
  return {
    govde: `M${yuvarla(basX)} ${yuvarla(basY)}Q${yuvarla(kx)} ${yuvarla(ky)} ${yuvarla(hedefX)} ${yuvarla(bitY)}`,
    uc: `M${yuvarla(ucX)} ${yuvarla(ucY)}L${yuvarla(solX)} ${yuvarla(solY)}L${yuvarla(sagX)} ${yuvarla(sagY)}Z`,
  };
}

/**
 * Tur kendiliğinden açılır mı? Otomatik tarayıcı denetimlerinde (uçtan uca testler) kapalıdır: örtü, testlerin
 * dokunacağı düğmeleri kapatırdı. Tanıtımın kendi testi `tanitim.zorla` anahtarıyla açar.
 */
export function otomatikAcilir(
  ortam: {
    navigator?: { webdriver?: boolean };
    localStorage?: { getItem(k: string): string | null };
  } = globalThis as never,
): boolean {
  try {
    if (ortam.localStorage?.getItem('tanitim.zorla') === '1') return true;
  } catch {
    // depo kapalı (gizli sekme): zorlama yok sayılır
  }
  return ortam.navigator?.webdriver !== true;
}
