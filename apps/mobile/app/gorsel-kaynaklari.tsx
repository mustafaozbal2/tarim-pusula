import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import KAYNAKLAR from '../assets/haber/KAYNAKLAR.json';
import { FlowHeader, FlowScreen } from '../src/components/FlowParts';

interface Kayit {
  dosya: string;
  baslik: string;
  yazar: string;
  lisans: string;
  sayfa: string;
}

/** Play ve lisans koşulu: haber görsellerinin yazarı, lisansı ve kaynağı. */
export default function GorselKaynaklari() {
  const liste = Object.values(KAYNAKLAR as Record<string, Kayit>);
  return (
    <FlowScreen>
      <FlowHeader title="Görsel kaynakları" />
      <Text style={styles.muted}>
        Haber kartlarındaki fotoğraflar Wikimedia Commons'tan, aşağıdaki lisanslarla alınmıştır.
        Hava verisi Open-Meteo ve MET Norway (CC BY 4.0) kaynaklıdır. Yazı tipi: Manrope (SIL Open
        Font License). Resmî kurum sitelerinden alınan duyurularda kaynak, haberin altında yazar.
      </Text>
      {liste.map((k) => (
        <Card key={k.dosya} style={styles.card}>
          <Text style={styles.name}>{k.baslik.replace(/^File:/, '')}</Text>
          <Text style={styles.muted}>
            {k.yazar} · {k.lisans}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Kaynağı aç: ${k.baslik}`}
            onPress={() => void Linking.openURL(k.sayfa)}
            style={styles.link}
          >
            <Text style={styles.linkText}>Kaynağı aç</Text>
          </Pressable>
        </Card>
      ))}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  name: { fontFamily: fontFamily.extrabold, fontSize: fontSize.small, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
});
