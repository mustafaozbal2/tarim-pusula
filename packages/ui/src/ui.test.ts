import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { buttonStyle, chipStyle, DRAFT_BADGE_TEXT, textStyles, type ButtonVariant } from './styles';
import { colors, fontSize, MIN_BODY_FONT_SIZE, MIN_FONT_SIZE, MIN_TOUCH_TARGET } from './tokens';

describe('dokunma alanı ve yazı boyu', () => {
  it('düğme en az 56 px; daha küçük istenirse 56 olur', () => {
    expect(buttonStyle('primary', 40).minHeight).toBe(MIN_TOUCH_TARGET);
    expect(buttonStyle().minHeight).toBeGreaterThanOrEqual(60);
  });
  it('çip en az 56 px', () => {
    expect(chipStyle('idle').minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
  it('yazı boyları eşiklerin altına inmez', () => {
    expect(fontSize.small).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(fontSize.body).toBeGreaterThanOrEqual(MIN_BODY_FONT_SIZE);
    expect(textStyles.small.fontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
    expect(textStyles.body.fontSize).toBeGreaterThanOrEqual(MIN_BODY_FONT_SIZE);
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
  it('ana ve ikincil metin zeminde okunur', () => {
    expect(contrastRatio(colors.forest, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.amberText, colors.amberSoft)).toBeGreaterThanOrEqual(4.5);
  });
  it('bilinen değer: siyah/beyaz 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});
