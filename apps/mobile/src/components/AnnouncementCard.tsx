import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { AnnouncementDto } from '../api/client';
import { tr } from '../i18n/tr';
import { announcementBody, announcementSource } from '../today/announcementText';
import { gorselUri, guvenliBaglanti } from '../today/duyuru';

/**
 * Kurum duyurusu: başlık, metin, kaynak + yayın tarihi, onaysızsa rozet ve "Neden?" (bu duyuru
 * tarlama neden geldi). Onaysız duyuru yalnız bilgidir; bildirim/uyarı üretmez.
 */
export function AnnouncementCard({ a }: { a: AnnouncementDto }) {
  const [open, setOpen] = useState(false);
  const gorsel = gorselUri(a);
  const baglanti = a.auto ? guvenliBaglanti(a.sourceUrl) : null;
  return (
    <Card testID="duyuru-karti" style={styles.card}>
      <Text style={styles.title}>{a.title}</Text>
      {gorsel ? (
        <Image
          source={{ uri: gorsel }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={`${a.title} görseli`}
          testID="duyuru-gorsel"
        />
      ) : null}
      <Text style={styles.body}>{announcementBody(a.body)}</Text>
      {a.auto ? (
        <Text style={styles.auto} testID="duyuru-otomatik">
          {tr.today.autoNote}
        </Text>
      ) : null}
      {baglanti ? (
        <Button
          label={tr.today.openSource}
          testID="duyuru-kaynagi-ac"
          onPress={() => void Linking.openURL(baglanti)}
        />
      ) : null}
      <View style={styles.meta}>
        <View />
        <Button
          label={tr.today.why}
          variant="secondary"
          testID="duyuru-neden"
          onPress={() => setOpen((v) => !v)}
        />
      </View>
      <Text style={styles.muted} testID="duyuru-kaynak">
        {announcementSource(a)}
      </Text>
      {open ? (
        <View>
          <Text style={styles.muted} testID="duyuru-neden-metin">
            {a.why}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  // Yetkili fotoğrafı 16:9 kırpılır; 16:10 ile yüz/başlık kesilmez.
  image: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, backgroundColor: colors.card },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  auto: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.amberText,
    backgroundColor: colors.amberSoft,
    borderRadius: 8,
    padding: 8,
  },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
});
