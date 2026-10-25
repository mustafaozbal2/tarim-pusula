import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, fontSize, homeColors } from '@tarim/ui';
import { tr } from '../i18n/tr';
import { Icon } from './Icon';

/**
 * Ana sayfa dışındaki sayfaların üst bandı: ana sayfadaki turkuaz bant ve köşegen açık şerit (aynı dil),
 * solda geri düğmesi, yanında sayfa başlığı. Koyu metin: turkuaz üstünde beyaz yazı AA karşıtlığı vermez.
 */
export function UstBant({
  title,
  step,
  onBack,
}: {
  title?: string;
  /** Akış adımı ("1 / 3" gibi); başlığın sağında küçük yazı. */
  step?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.band, { paddingTop: Math.max(insets.top, 12) + 8 }]} testID="ust-bant">
      <View style={styles.stripe} pointerEvents="none" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr.flow.back}
        testID="geri"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={styles.back}
      >
        <View style={styles.backCircle}>
          <Icon name="back" size={20} color={homeColors.text} />
        </View>
      </Pressable>
      {title ? (
        <Text accessibilityRole="header" style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {step ? <Text style={styles.step}>{step}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: homeColors.band,
    paddingHorizontal: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: 18,
    height: 44,
    backgroundColor: homeColors.bandStripe,
    transform: [{ rotate: '-6deg' }],
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    color: homeColors.text,
  },
  step: { fontFamily: fontFamily.bold, fontSize: 14, color: homeColors.text },
});
