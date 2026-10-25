import type { TextSize } from '../../../packages/ui/src/tokens';

/** Uygulama içi ayarlar (cihaz deposunda): yazı boyutu Normal/Büyük, ses rehberi aç/kapa. */
export interface Settings {
  textSize: TextSize;
  voiceGuide: boolean;
  /** Geliştirici modu: Ayarlar'da sürüm numarasına 7 dokunuşla açılır (sunucu adresi kartı yalnız bunda görünür). */
  devMode: boolean;
}

export const DEFAULTS: Settings = { textSize: 'normal', voiceGuide: false, devMode: false };

/** Sürüm numarasına art arda dokunma sayacı (G19.8). */
export const DEV_TAPS = 7;
export const DEV_TAP_WINDOW_MS = 4000;
export interface TapState {
  count: number;
  last: number;
}
/** Dokunuşlar arası en çok DEV_TAP_WINDOW_MS; aralık aşılırsa sayaç 1'den başlar. */
export function nextTap(prev: TapState, now: number): { state: TapState; unlocked: boolean } {
  const count = prev.count > 0 && now - prev.last <= DEV_TAP_WINDOW_MS ? prev.count + 1 : 1;
  return count >= DEV_TAPS
    ? { state: { count: 0, last: now }, unlocked: true }
    : { state: { count, last: now }, unlocked: false };
}

export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULTS;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      textSize: o.textSize === 'large' ? 'large' : 'normal',
      voiceGuide: o.voiceGuide === true,
      devMode: o.devMode === true,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Bir yazı stiline ölçek uygular (yazı boyu ve satır yüksekliği). */
export function scaleTextStyle(
  style: { fontSize?: number; lineHeight?: number } | undefined,
  scale: number,
): { fontSize: number; lineHeight?: number } {
  const fontSize = (style?.fontSize ?? 14) * scale;
  return style?.lineHeight === undefined
    ? { fontSize }
    : { fontSize, lineHeight: style.lineHeight * scale };
}
