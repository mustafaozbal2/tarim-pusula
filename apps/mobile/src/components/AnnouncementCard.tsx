import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import type { AnnouncementDto } from '../api/client';
import { tr } from '../i18n/tr';
import { announcementSource } from '../today/announcementText';

/**
 * Kurum duyurusu: başlık, metin, kaynak + yayın tarihi, onaysızsa rozet ve "Neden?" (bu duyuru
 * tarlama neden geldi). Onaysız duyuru yalnız bilgidir; bildirim/uyarı üretmez.
 */
export function AnnouncementCard({ a }: { a: AnnouncementDto }) {
  const [open, setOpen] = useState(false);
  return (
    <Card testID="duyuru-karti" style={styles.card}>
      <Text style={styles.title}>{a.title}</Text>
      <Text style={styles.body}>{a.body}</Text>
      <View style={styles.meta}>
        {a.needsBadge ? <Badge label={tr.today.announcementPending} /> : <View />}
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
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
});
