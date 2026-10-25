import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Durum, TarihBasliSatir } from '@tarim/ui';
import { Screen } from '../src/components/Screen';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import {
  loadSeen,
  markAllSeen,
  notificationItems,
  type NotificationItem,
} from '../src/notifications/state';
import { api } from '../src/session';
import { loadAnnouncements } from '../src/today/announcements';
import { loadToday } from '../src/today/load';

const t = tr.notifications;

/** Bildirim listesi: okunmamışlar işaretli; liste açılınca hepsi okundu sayılır (rozet söner). */
export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unreadKeys, setUnreadKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    let list: NotificationItem[] = [];
    try {
      const r = await loadToday(api, kv);
      if (r) list = notificationItems(r.today, await loadAnnouncements(api, kv, r.field.id));
    } catch {
      list = [];
    }
    const seen = new Set(await loadSeen(kv));
    setUnreadKeys(new Set(list.filter((i) => !seen.has(i.key)).map((i) => i.key)));
    setItems(list);
    await markAllSeen(kv, list);
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title={t.title}>
      {items === null ? <Durum kind="yukleniyor" text={t.loading} /> : null}
      {items?.length === 0 ? <Durum kind="bos" text={t.empty} /> : null}
      <View style={styles.list} testID="bildirim-listesi">
        {items?.map((n) => (
          <View key={n.key} style={styles.row}>
            <TarihBasliSatir
              testID="liste-satiri"
              date={n.date}
              title={n.title}
              tone={n.tone}
              badge={unreadKeys.has(n.key) ? t.unread : undefined}
            />
          </View>
        ))}
      </View>
      <Text style={styles.note}>{t.note}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {},
  note: { fontSize: 12, color: '#4F6258' },
});
