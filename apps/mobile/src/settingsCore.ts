import type { TextSize } from '../../../packages/ui/src/tokens';

/** Uygulama içi ayarlar (cihaz deposunda): yazı boyutu Normal/Büyük, ses rehberi aç/kapa. */
export interface Settings {
  textSize: TextSize;
  voiceGuide: boolean;
}

export const DEFAULTS: Settings = { textSize: 'normal', voiceGuide: false };

export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULTS;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    return {
      textSize: o.textSize === 'large' ? 'large' : 'normal',
      voiceGuide: o.voiceGuide === true,
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
