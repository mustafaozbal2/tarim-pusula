import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, FormAlani, fontFamily, fontSize, spacing } from '@tarim/ui';
import { normalizeApiUrl } from '../config';
import { tr } from '../i18n/tr';
import { currentApiUrl, saveApiUrl } from '../session';

const t = tr.server;

/**
 * Sunucuya ulaşılamayınca (ya da adres hiç yokken) çıkan kart. Adres uygulama içinden yazılabilir;
 * böylece APK'yı yeniden derlemeden bilgisayarın yerel ağ adresine bağlanılır.
 */
export function SunucuKarti({
  onRetry,
  variant = 'error',
}: {
  onRetry?: () => void;
  variant?: 'error' | 'settings';
}) {
  const error = variant === 'error';
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void currentApiUrl().then((u) => {
      setCurrent(u);
      if (u) setValue(u);
    });
  }, []);

  const save = async () => {
    const url = normalizeApiUrl(value);
    if (!url) return setMsg(t.invalid);
    await saveApiUrl(url);
    setCurrent(url);
    setMsg(t.saved);
    onRetry?.();
  };

  return (
    <Card testID="sunucu-karti" style={[styles.card, !error && styles.calm]}>
      <Text
        accessibilityRole={error ? 'alert' : 'header'}
        style={[styles.title, !error && { color: colors.forest }]}
      >
        {error ? t.title : t.address}
      </Text>
      <Text style={styles.text} testID="sunucu-adres">
        {current ? `${t.address}: ${current}` : t.noAddress}
      </Text>
      <FormAlani
        testID="sunucu-adres-girdi"
        label={t.address}
        value={value}
        onChangeText={setValue}
        placeholder="http://192.168.1.20:8200"
      />
      <Text style={styles.hint}>{t.addressHint}</Text>
      {msg ? <Text style={styles.text}>{msg}</Text> : null}
      <View style={styles.row}>
        <Button
          label={t.save}
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => void save()}
        />
        {onRetry ? <Button label={t.retry} style={{ flex: 1 }} onPress={onRetry} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, borderColor: colors.brick, backgroundColor: colors.brickSoft },
  calm: { borderColor: colors.border, backgroundColor: colors.surface },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.brick },
  text: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.forest },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, color: colors.textMuted },
  row: { flexDirection: 'row', gap: spacing.md },
});
