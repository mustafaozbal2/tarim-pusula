import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, Durum, fontFamily, fontSize } from '@tarim/ui';
import type { ResmiKaynakDto } from '../src/api/client';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { tr } from '../src/i18n/tr';
import { withDeadline } from '../src/load/deadline';
import { api } from '../src/session';
import { shortDate } from '../src/staff/useYukle';

const t = tr.resmiKaynak;

/** Hangi resmi sitelerin taranıp duyuru olarak getirildiği (şeffaflık). */
export default function ResmiKaynaklar() {
  const [items, setItems] = useState<ResmiKaynakDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems((await withDeadline(api.resmiKaynaklar())).sources);
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <Screen title={t.title}>
      <Text style={styles.body}>{t.intro}</Text>
      <Text style={styles.small}>{t.note}</Text>
      {items === null && !failed ? <Iskelet /> : null}
      {failed ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {items?.length === 0 ? <Durum kind="bos" text={t.empty} /> : null}
      <View style={{ gap: 10 }} testID="resmi-kaynak-listesi">
        {items?.map((s) => (
          <Card key={s.id} style={styles.card}>
            <Text style={styles.name}>{s.name}</Text>
            <Text style={styles.small}>
              {t.lastCheck}: {s.lastCheckedAt ? shortDate(s.lastCheckedAt) : t.never}
            </Text>
            {s.url.startsWith('https://') ? (
              <Button
                label={t.open2}
                variant="secondary"
                onPress={() => void Linking.openURL(s.url)}
              />
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6 },
  name: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
