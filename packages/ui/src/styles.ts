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

export function buttonStyle(variant: ButtonVariant = 'primary', minHeight = 60): ButtonStyle {
  return { minHeight: Math.max(minHeight, MIN_TOUCH_TARGET), ...variants[variant] };
}

export type ChipState = 'idle' | 'selected';

export function chipStyle(state: ChipState) {
  return {
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: state === 'selected' ? colors.pistachio : colors.surface,
    borderColor: state === 'selected' ? colors.forest : colors.border,
    textColor: state === 'selected' ? colors.pistachioText : colors.forest,
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
