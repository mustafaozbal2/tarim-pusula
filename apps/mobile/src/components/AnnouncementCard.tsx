import { hedefRef } from '../tanitim/hedef';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { AnnouncementDto } from '../api/client';
import { tr } from '../i18n/tr';
import { announcementBody, announcementSource } from '../today/announcementText';
import { gorselUri, guvenliBaglanti } from '../today/duyuru';
import { haberGorselAdi, haberGorselNotu } from '../today/haberGorseli';
import { ImageSlot } from './ImageSlot';

/**
 * Kurum duyurusu: başlık, metin, kaynak + yayın tarihi, onaysızsa rozet ve "Neden?" (bu duyuru
 * tarlama neden geldi). Onaysız duyuru yalnız bilgidir; bildirim/uyarı üretmez.
 */
export function AnnouncementCard({ a }: { a: AnnouncementDto }) {
  const [open, setOpen] = useState(false);
  const gorsel = gorselUri(a);
  const kutuphane = haberGorselAdi(a);
  const not = gorsel ? null : haberGorselNotu(kutuphane);
  const baglanti = a.auto ? guvenliBaglanti(a.sourceUrl) : null;
  return (
    <Card testID="duyuru-karti" style={styles.card}>
      <Text style={styles.title} ref={hedefRef('haber.baslik')}>
        {a.title}
      </Text>
      {a.applyUntil ? (
        <View style={styles.sonGun} testID="duyuru-son-gun">
          <Text style={styles.sonGunYazi}>
            Son başvuru:{' '}
            {new Date(`${a.applyUntil}T12:00:00`).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </View>
      ) : null}
      <ImageSlot
        name={kutuphane}
        uri={gorsel}
        label={`${a.title} görseli`}
        testID="duyuru-gorsel"
        style={styles.image}
      />
      {not ? <Text style={styles.muted}>{not}</Text> : null}
      <Text style={styles.body} ref={hedefRef('haber.metin')}>
        {announcementBody(a.body)}
      </Text>
      {a.auto ? (
        <Text style={styles.auto} testID="duyuru-otomatik">
          {tr.today.autoNote}
        </Text>
      ) : null}
      {baglanti ? (
        <Button
          ref={hedefRef('haber.kaynagi-ac')}
          label={tr.today.openSource}
          testID="duyuru-kaynagi-ac"
          onPress={() => void Linking.openURL(baglanti)}
        />
      ) : null}
      <View style={styles.meta}>
        <View />
        <Button
          ref={hedefRef('haber.neden')}
          label={tr.today.why}
          variant="secondary"
          testID="duyuru-neden"
          onPress={() => setOpen((v) => !v)}
        />
      </View>
      <Text style={styles.muted} ref={hedefRef('haber.kaynak')} testID="duyuru-kaynak">
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
  title: { fontFamily: fontFamily.extrabold, fontSize: 18, lineHeight: 24, color: colors.forest },
  body: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    lineHeight: 22,
    color: '#231F20',
  },
  // Son başvuru günü: kehribar şerit (çiftçi ilk bakışta görsün).
  sonGun: {
    alignSelf: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sonGunYazi: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.small,
    color: colors.amberText,
  },
  auto: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.forest,
    backgroundColor: colors.pistachio,
    borderRadius: 8,
    padding: 8,
  },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
});
