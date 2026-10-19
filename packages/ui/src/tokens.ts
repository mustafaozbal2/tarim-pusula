/** Tasarım belirteçleri — kaynak: docs/UX_KURALLARI.md ve docs/prototype/. */
export const colors = {
  forest: '#14392B', // ana
  pistachio: '#E3EFD2', // seçili / güvenli
  pistachioText: '#1F4D12',
  water: '#1D5B7A', // sulama
  waterSoft: '#DCEBF3',
  amber: '#F2C14E', // uyarı
  amberSoft: '#FFF4DC',
  amberText: '#5A3D00',
  brick: '#9B2F1E', // durdur / tehlike
  brickSoft: '#F6E1DC',
  wheat: '#D9A441', // yalnız vurgu, metin değil
  background: '#F4F6F0',
  surface: '#FFFFFF',
  border: '#DCE3D5',
  textMuted: '#4F6258',
  onForest: '#FFFFFF',
} as const;

export const fontFamily = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

/** Kabul eşikleri: bunların altına inilemez (testle korunur). */
export const MIN_TOUCH_TARGET = 56;
export const MIN_FONT_SIZE = 16;
export const MIN_BODY_FONT_SIZE = 18;
/** Sekme etiketi prototipte 13'tür; dokunma alanı 60 px ile telafi edilir. */
export const TAB_LABEL_FONT_SIZE = 13;
export const TAB_HEIGHT = 60;

export const fontSize = { small: 16, body: 18, title: 24, display: 56 } as const;
export const radius = { card: 24, row: 18, pill: 30 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
