import { colors, fontFamily, fontSize, MIN_TOUCH_TARGET, radius, spacing } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'water';

export interface ButtonStyle {
  minHeight: number;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}

const variants: Record<ButtonVariant, Omit<ButtonStyle, 'minHeight'>> = {
  primary: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
    textColor: colors.onForest,
  },
  secondary: {
    backgroundColor: colors.pistachio,
    borderColor: colors.border,
    textColor: colors.pistachioText,
  },
  danger: { backgroundColor: colors.brick, borderColor: colors.brick, textColor: '#FFFFFF' },
  water: { backgroundColor: colors.water, borderColor: colors.water, textColor: '#FFFFFF' },
};

export function buttonStyle(
  variant: ButtonVariant = 'primary',
  minHeight = MIN_TOUCH_TARGET + 2,
): ButtonStyle {
  return { minHeight: Math.max(minHeight, MIN_TOUCH_TARGET), ...variants[variant] };
}

export type ChipState = 'idle' | 'selected';

export function chipStyle(state: ChipState) {
  return {
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: state === 'selected' ? colors.forest : colors.surface,
    borderColor: state === 'selected' ? colors.forest : colors.border,
    textColor: state === 'selected' ? colors.onForest : colors.forest,
  };
}

export const cardStyle = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderRadius: radius.card,
  padding: spacing.xl,
} as const;

export const textStyles = {
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
} as const;

export const DRAFT_BADGE_TEXT = 'Uzman onayı bekliyor';

/** gg/aa/yyyy (eski uygulamadaki tarih kutusu biçimi). */
export function formatDateBox(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--/--/----';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export interface TabloSutunu {
  key: string;
  title: string;
  flex?: number;
}
export type TabloSatiri = Record<string, string | number | boolean | null> & { id: string };

/** Süzme: büyük/küçük harf (Türkçe) duyarsız, tüm sütunlarda arar. */
export function tabloSuz(
  rows: TabloSatiri[],
  columns: TabloSutunu[],
  query: string,
): TabloSatiri[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return rows;
  return rows.filter((r) =>
    columns.some((c) =>
      String(r[c.key] ?? '')
        .toLocaleLowerCase('tr-TR')
        .includes(q),
    ),
  );
}
