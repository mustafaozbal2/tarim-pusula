/**
 * Tasarım belirteçleri — tek kaynak: docs/TASARIM_REFERANSI.md. G23: bütün sayfalar ana sayfanın turkuaz
 * dilinde (Mustafa, 25 Ekim 2026). Adlar eski kodla uyum için korunur; değerler turkuazdır.
 */
export const colors = {
  forest: '#1F6E6D', // koyu turkuaz: başlık, ana düğme, seçili öğe (beyazla 5,98:1)
  pistachio: '#DDF1EE', // seçili / güvenli zemin (açık turkuaz)
  pistachioText: '#1F6E6D',
  listGreen: '#1C7472', // liste satırı dolgusu (beyazla 5,54:1)
  card: '#EAF6F5', // açık zemin kartı
  water: '#1D5B7A', // yalnız sulama
  waterSoft: '#DCEBF3',
  amber: '#F2C14E', // yalnız uyarı
  amberSoft: '#FFF4DC',
  amberText: '#5A3D00',
  brick: '#B01B4A', // tehlike / sil
  brickSoft: '#FCE4EC',
  wheat: '#D9A441', // yalnız vurgu, metin değil
  background: '#F1F1F2', // ana sayfa zemini ile aynı
  surface: '#FFFFFF',
  border: '#D3E6E3',
  textMuted: '#4A5F5E',
  onForest: '#FFFFFF',
} as const;

export const fontFamily = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

/** Kabul eşikleri: bunların altına inilemez (testle korunur). */
export const MIN_TOUCH_TARGET = 44;
export const MIN_FONT_SIZE = 12;
export const MIN_BODY_FONT_SIZE = 14;
export const TAB_LABEL_FONT_SIZE = 12;
export const TAB_HEIGHT = 52;
/** Liste satırı yüksekliği (44–48 px). */
export const ROW_HEIGHT = 46;

/** Sıkı tipografi ölçeği: gövde 14–15, satır başlığı 15–16, ikincil 12–13. */
export const fontSize = {
  small: 13,
  caption: 12,
  body: 15,
  row: 15,
  title: 18,
  display: 28,
} as const;
/** Yuvarlak köşeler (G23: ana sayfadaki gibi yumuşak). */
export const radius = { card: 18, row: 12, pill: 14 } as const;

/** Kabartı: kartların altında yumuşak gölge (iOS shadow*, Android elevation, web boxShadow). */
export const elevation = {
  card: {
    shadowColor: '#1F6E6D',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#1F6E6D',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
export const spacing = { xs: 4, sm: 6, md: 8, lg: 12, xl: 14 } as const;

/** "Yazı boyutu" ayarı: Büyük mod eskiden kabul edilen 18 px düzenine denk gelir (15 × 1,2). */
export type TextSize = 'normal' | 'large';
export const TEXT_SCALE: Record<TextSize, number> = { normal: 1, large: 1.2 };

/**
 * Ana sayfa renkleri: docs/referans/anasayfa_hedef.png üzerinden piksel örneklenmiştir
 * (docs/gorsel/ANASAYFA_FARK.md). Çakışmada hedef görsel kazanır (G19).
 */
export const homeColors = {
  band: '#4DB4B5', // üst bant
  bandStripe: '#5ABDBF', // köşegen açık şerit
  page: '#F1F1F2', // sayfa zemini
  tabSelected: '#3D8E8D', // seçili sekme (koyu turkuaz)
  dateBox: '#82D4CA', // tarih kutusu
  rowBox: '#AAE2D8', // satır metin kutusu
  name: '#42918F', // arazi adı
  text: '#231F20', // satır ve başlık metni
  badge: '#EE3270', // bildirim sayı rozeti
  badgeDot: '#C0392B', // Dikkat rozeti
} as const;
