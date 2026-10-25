/** Tasarım belirteçleri — tek kaynak: docs/TASARIM_REFERANSI.md (eski uygulama temelli palet). */
export const colors = {
  forest: '#064D3B', // koyu yeşil: seçili sekme, kenar menü, başlık
  pistachio: '#E3F2EC', // seçili / güvenli zemin
  pistachioText: '#064D3B',
  listGreen: '#1B7F5A', // liste satırı dolgusu (#24976E beyazla 3,7:1 kaldı; AA için koyulaştırıldı)
  card: '#F3FAF9', // açık zemin kartı
  water: '#1D5B7A', // yalnız sulama
  waterSoft: '#DCEBF3',
  amber: '#F2C14E', // yalnız uyarı
  amberSoft: '#FFF4DC',
  amberText: '#5A3D00',
  brick: '#B01B4A', // tehlike / sil
  brickSoft: '#FCE4EC',
  wheat: '#D9A441', // yalnız vurgu, metin değil
  background: '#F1F3F4',
  surface: '#FFFFFF',
  border: '#D9DEE0',
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
export const radius = { card: 12, row: 8, pill: 10 } as const;
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
