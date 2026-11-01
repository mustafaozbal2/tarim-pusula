import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '@tarim/ui';
import { GirisDugme, GirisZemin } from '../../src/components/Giris';
import { DEMO_BUILD, loadDemoInfo, type DemoInfoDto } from '../../src/demo';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';

const t = tr.auth;

/** G24 açılış: tarla fotoğrafı üstünde iki kapı (çiftçi / yetkili). */
export default function Hosgeldin() {
  const router = useRouter();
  const [demo, setDemo] = useState<DemoInfoDto | null>(null);
  // Deneme hesapları yalnız sunucu demo kipindeyse görünür (gerçek sunucuda /demo/info yoktur).
  useEffect(() => {
    if (DEMO_BUILD) void loadDemoInfo(() => api.demoInfo()).then(setDemo);
  }, []);
  return (
    <GirisZemin title={t.welcomeTitle} testID="giris-hosgeldin">
      <Text style={styles.text}>{t.welcomeText}</Text>
      <GirisDugme
        label={t.asFarmer}
        testID="giris-ciftci"
        onPress={() => router.push('/giris/ciftci')}
      />
      <GirisDugme
        label={t.asStaff}
        tone="ikinci"
        testID="giris-yetkili"
        onPress={() => router.push('/giris/yetkili')}
      />
      <Text style={styles.hint}>{t.staffHint}</Text>
      {demo ? (
        <View style={styles.demo} testID="giris-demo">
          <Text style={styles.demoTitle}>{t.demoTitle}</Text>
          <Text style={styles.demoLine}>
            {t.demoFarmer}: {demo.farmerPhone}
          </Text>
          {(demo.staff ?? []).map((s) => (
            <Text key={s.phone} style={styles.demoLine}>
              {s.label}: {s.phone}
            </Text>
          ))}
          {demo.password ? (
            <Text style={styles.demoLine}>
              {t.demoPassword}: {demo.password} · {t.demoCode}: {demo.code}
            </Text>
          ) : null}
        </View>
      ) : null}
    </GirisZemin>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.forest, marginBottom: 2 },
  hint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  demo: { backgroundColor: colors.pistachio, borderRadius: 12, padding: 10, gap: 2 },
  demoTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.forest },
  demoLine: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.forest },
});
