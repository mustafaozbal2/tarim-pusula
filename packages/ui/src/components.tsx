import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { buttonStyle, cardStyle, chipStyle, DRAFT_BADGE_TEXT, type ButtonVariant } from './styles';
import { colors, fontFamily, fontSize, radius, spacing } from './tokens';

export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const s = buttonStyle(props.variant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[
        styles.button,
        { minHeight: s.minHeight, backgroundColor: s.backgroundColor, borderColor: s.borderColor },
        props.style,
      ]}
    >
      <Text style={[styles.buttonText, { color: s.textColor }]}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, props.style]}>{props.children}</View>;
}

export function Chip(props: { label: string; selected?: boolean; onPress?: () => void }) {
  const s = chipStyle(props.selected ? 'selected' : 'idle');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.selected }}
      onPress={props.onPress}
      style={[
        styles.chip,
        { minHeight: s.minHeight, backgroundColor: s.backgroundColor, borderColor: s.borderColor },
      ]}
    >
      <Text style={[styles.chipText, { color: s.textColor }]}>{props.label}</Text>
    </Pressable>
  );
}

/** Onaysız bilgi rozeti (değişmez kural 1). Renk tek başına anlam taşımaz: yazı her zaman var. */
export function Badge(props: { label?: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{props.label ?? DRAFT_BADGE_TEXT}</Text>
    </View>
  );
}

/** Büyük seçim satırı: başlık + isteğe bağlı açıklama. */
export function BigChoice(props: {
  title: string;
  hint?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.selected }}
      onPress={props.onPress}
      style={[
        styles.choice,
        props.selected && { backgroundColor: colors.pistachio, borderColor: colors.forest },
      ]}
    >
      <Text style={styles.choiceTitle}>{props.title}</Text>
      {props.hint ? <Text style={styles.choiceHint}>{props.hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  buttonText: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body },
  card: { ...cardStyle, borderWidth: 1 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.bold, fontSize: fontSize.small },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.amberText },
  choice: {
    minHeight: 64,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  choiceTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body, color: colors.forest },
  choiceHint: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
});
