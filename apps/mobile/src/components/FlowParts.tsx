import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamily, fontSize, radius, spacing } from '@tarim/ui';
import { tr } from '../i18n/tr';
import { DemoBadge } from './DemoBadge';
import { Icon, type IconName } from './Icon';

/** Akış ekranı gövdesi: zemin rengi, kenar boşluğu, kaydırma. */
export function FlowScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md }}>
        <DemoBadge />
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md }}>{footer}</View>
      ) : null}
    </View>
  );
}

/** Üst şerit: geri düğmesi (56 px) ve adım yazısı. */
export function FlowHeader({ step, onBack }: { step?: string; onBack?: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr.flow.back}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.back}
      >
        <Icon name="back" size={26} />
      </Pressable>
      {step ? <Text style={styles.step}>{step}</Text> : null}
    </View>
  );
}

type Tone = 'primary' | 'outline' | 'soft';

/** Prototipteki büyük seçim satırı: ikon + başlık + açıklama (en az 92 px). */
export function ChoiceRow(props: {
  title: string;
  hint: string;
  icon: IconName;
  tone: Tone;
  onPress: () => void;
  testID?: string;
}) {
  const dark = props.tone === 'primary';
  const soft = props.tone === 'soft';
  const fg = dark ? '#FFFFFF' : soft ? colors.pistachioText : colors.forest;
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      onPress={props.onPress}
      style={[
        styles.choice,
        dark && { backgroundColor: colors.forest },
        props.tone === 'outline' && { backgroundColor: colors.surface, borderColor: colors.forest },
        soft && {
          backgroundColor: colors.pistachio,
          borderColor: '#7C9A66',
          borderStyle: 'dashed',
        },
      ]}
    >
      <Icon name={props.icon} size={40} color={dark ? colors.amber : fg} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceTitle, { color: fg }]}>{props.title}</Text>
        <Text
          style={[
            styles.choiceHint,
            { color: dark ? '#CFE0D6' : soft ? '#2F4B24' : colors.textMuted },
          ]}
        >
          {props.hint}
        </Text>
      </View>
    </Pressable>
  );
}

/** Kısa bilgi/uyarı kutusu; renk tek başına anlam taşımaz, yazı her zaman var. */
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
}) {
  return (
    <View
      style={[
        styles.notice,
        tone === 'warn' && { backgroundColor: colors.amberSoft, borderColor: colors.amber },
      ]}
    >
      <Text style={[styles.noticeText, tone === 'warn' && { color: colors.amberText }]}>
        {children}
      </Text>
    </View>
  );
}

export const titleStyle = {
  fontFamily: fontFamily.extrabold,
  fontSize: 22,
  color: colors.forest,
  lineHeight: 36,
} as const;
export const subtitleStyle = {
  fontFamily: fontFamily.semibold,
  fontSize: fontSize.body,
  color: colors.textMuted,
} as const;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  back: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  step: { fontFamily: fontFamily.extrabold, fontSize: fontSize.small, color: colors.textMuted },
  choice: {
    minHeight: 56,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.forest,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  choiceTitle: { fontFamily: fontFamily.extrabold, fontSize: 17 },
  choiceHint: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, marginTop: 2 },
  notice: {
    backgroundColor: colors.pistachio,
    borderColor: '#7C9A66',
    borderWidth: 1,
    borderRadius: radius.row,
    padding: spacing.lg,
  },
  noticeText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.small,
    color: colors.pistachioText,
  },
});
