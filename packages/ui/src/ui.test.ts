import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  buttonStyle,
  chipStyle,
  DRAFT_BADGE_TEXT,
  formatDateBox,
  tabloSuz,
  textStyles,
  type ButtonVariant,
} from './styles';
import {
  colors,
  fontSize,
  MIN_BODY_FONT_SIZE,
  MIN_FONT_SIZE,
  MIN_TOUCH_TARGET,
  ROW_HEIGHT,
  TEXT_SCALE,
} from './tokens';

describe('dokunma alanı ve yazı boyu (TASARIM_REFERANSI yoğunluk kuralları)', () => {
  it('düğme en az 44 px, 44–48 aralığında; daha küçük istenirse 44 olur', () => {
    expect(buttonStyle('primary', 30).minHeight).toBe(MIN_TOUCH_TARGET);
    expect(buttonStyle().minHeight).toBeGreaterThanOrEqual(44);
    expect(buttonStyle().minHeight).toBeLessThanOrEqual(48);
  });
  it('çip ve liste satırı en az 44 px', () => {
    expect(chipStyle('idle').minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(ROW_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(ROW_HEIGHT).toBeLessThanOrEqual(48);
  });
  it('tipografi ölçeği: gövde 14–15, satır başlığı 15–16, ikincil 12–13', () => {
    expect(fontSize.body).toBeGreaterThanOrEqual(14);
    expect(fontSize.body).toBeLessThanOrEqual(15);
    expect(fontSize.row).toBeGreaterThanOrEqual(15);
    expect(fontSize.row).toBeLessThanOrEqual(16);
    expect(fontSize.small).toBeGreaterThanOrEqual(12);
    expect(fontSize.small).toBeLessThanOrEqual(13);
    expect(fontSize.caption).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(textStyles.body.fontSize).toBeGreaterThanOrEqual(MIN_BODY_FONT_SIZE);
  });
  it('Büyük mod gövdeyi eski 18 px düzenine çıkarır', () => {
    expect(Math.round(fontSize.body * TEXT_SCALE.large)).toBe(18);
    expect(TEXT_SCALE.normal).toBe(1);
  });
  it('onaysız bilgi rozeti metni sabittir', () => {
    expect(DRAFT_BADGE_TEXT).toBe('Uzman onayı bekliyor');
  });
});

describe('renk karşıtlığı (WCAG AA, 4.5:1)', () => {
  const variants: ButtonVariant[] = ['primary', 'secondary', 'danger', 'water'];
  it.each(variants)('%s düğmesi okunur', (v) => {
    const s = buttonStyle(v);
    expect(contrastRatio(s.textColor, s.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
  it('liste satırı: beyaz yazı yeşil dolguda AA (eski #24976E 3:1 civarıydı)', () => {
    expect(contrastRatio('#FFFFFF', '#24976E')).toBeLessThan(4.5);
    expect(contrastRatio('#FFFFFF', colors.listGreen)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onForest, colors.forest)).toBeGreaterThanOrEqual(4.5);
  });
  it('ana ve ikincil metin zeminde okunur', () => {
    for (const bg of [colors.background, colors.card, colors.surface]) {
      expect(contrastRatio(colors.forest, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(colors.amberText, colors.amberSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.brick, colors.brickSoft)).toBeGreaterThanOrEqual(4.5);
  });
  it('bilinen değer: siyah/beyaz 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});

describe('tarih kutusu ve tablo', () => {
  it('gg/aa/yyyy biçimi', () => {
    expect(formatDateBox('2023-04-07T12:00:00Z')).toBe('07/04/2023');
    expect(formatDateBox('geçersiz')).toBe('--/--/----');
  });
  it('tablo araması Türkçe büyük/küçük harf duyarsızdır', () => {
    const cols = [{ key: 'ad', title: 'Ad' }];
    const rows = [
      { id: '1', ad: 'Isırgan' },
      { id: '2', ad: 'Zeytin' },
    ];
    expect(tabloSuz(rows, cols, 'ISIR').map((r) => r.id)).toEqual(['1']);
    expect(tabloSuz(rows, cols, 'ıs').map((r) => r.id)).toEqual(['1']);
    expect(tabloSuz(rows, cols, '  ').length).toBe(2);
    expect(tabloSuz(rows, cols, 'yok')).toEqual([]);
  });
});
