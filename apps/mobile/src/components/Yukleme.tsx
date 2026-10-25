import { StyleSheet, Text, View } from 'react-native';
import { Button, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { tr } from '../i18n/tr';

const t = tr.load;

/**
 * Yükleniyor durumu: düz metin yerine iskelet (skeleton) kartlar. Yükleyiciler `withDeadline` ile en geç
 * 10 sn'de sonuçlanır; ekran bu iskelette asılı kalmaz (G22.7).
 */
export function Iskelet({ rows = 3, testID = 'iskelet' }: { rows?: number; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={t.loading}
      style={styles.wrap}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={[styles.line, { width: '55%' }]} />
          <View style={[styles.line, { width: '85%' }]} />
          <View style={[styles.line, { width: '70%' }]} />
        </View>
      ))}
    </View>
  );
}

/** Yükleme başarısız ya da süre doldu: "Veri alınamadı, tekrar dene" + yeniden dene düğmesi. */
export function YuklemeHatasi({ onRetry }: { onRetry: () => void }) {
  return (
    <View testID="yukleme-hatasi" accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorText}>{t.failed}</Text>
      <Button label={t.retry} onPress={onRetry} testID="yeniden-dene" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  line: { height: 12, borderRadius: 6, backgroundColor: '#E3E7E8' },
  error: {
    backgroundColor: colors.brickSoft,
    borderColor: colors.brick,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.lg,
    gap: spacing.md,
  },
  errorText: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.brick },
});
