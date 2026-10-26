import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  colors,
  Durum,
  elevation,
  fontFamily,
  fontSize,
  formatDateBox,
  homeColors,
  radius,
} from '@tarim/ui';
import { IMAGE_FILES } from '../src/assets';
import { Icon } from '../src/components/Icon';
import { localIso } from '../src/home/model';
import { groupNotifications, notificationLook } from '../src/notifications/view';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { withDeadline } from '../src/load/deadline';
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
  const [failed, setFailed] = useState(false);
  const [unreadKeys, setUnreadKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    let list: NotificationItem[];
    setFailed(false);
    try {
      list = await withDeadline(
        (async () => {
          const r = await loadToday(api, kv);
          return r ? notificationItems(r.today, await loadAnnouncements(api, kv, r.field.id)) : [];
        })(),
      );
    } catch {
      setItems(null);
      setFailed(true);
      return;
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

  const groups = items ? groupNotifications(items, localIso()) : [];
  return (
    <Screen title={t.title}>
      <View style={styles.hero}>
        <Image source={IMAGE_FILES['ikon_bildirim.png'] as number} style={styles.heroIcon} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>
            {items && unreadKeys.size > 0
              ? t.unreadCount.replace('{{n}}', String(unreadKeys.size))
              : t.allRead}
          </Text>
          <Text style={styles.heroSub}>{t.note}</Text>
        </View>
      </View>
      {items === null && !failed ? <Iskelet /> : null}
      {failed ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {items?.length === 0 ? <Durum kind="bos" text={t.empty} /> : null}
      <View style={styles.list} testID="bildirim-listesi">
        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            {g.items.map((n) => {
              const look = notificationLook(n.id, n.tone);
              const unread = unreadKeys.has(n.key);
              return (
                <View
                  key={n.key}
                  style={[styles.card, look.kind === 'uyari' && styles.cardWarn]}
                  testID="liste-satiri"
                  accessibilityLabel={`${n.title}${unread ? `, ${t.unread}` : ''}`}
                >
                  <View style={[styles.iconBox, styles[`icon_${look.kind}` as 'icon_hava']]}>
                    <Icon name={look.icon} size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.body}>
                    <Text style={styles.title}>{n.title}</Text>
                    <Text style={styles.date}>{formatDateBox(n.date)}</Text>
                  </View>
                  {unread ? (
                    <View style={styles.newBadge}>
                      <Text style={styles.newText}>{t.unread}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: homeColors.band,
    borderRadius: radius.card,
    padding: 14,
    ...elevation.raised,
  },
  heroIcon: { width: 64, height: 64 },
  heroText: { flex: 1, gap: 2 },
  heroTitle: { fontFamily: fontFamily.extrabold, fontSize: 18, color: homeColors.text },
  heroSub: { fontFamily: fontFamily.medium, fontSize: 13, color: homeColors.text },
  list: { gap: 14 },
  group: { gap: 8 },
  groupTitle: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.forest },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  cardWarn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon_uyari: { backgroundColor: '#C77A00' },
  icon_su: { backgroundColor: colors.water },
  icon_duyuru: { backgroundColor: homeColors.tabSelected },
  icon_hava: { backgroundColor: '#E39B1B' },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
  date: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  newBadge: {
    backgroundColor: homeColors.badge,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newText: { fontFamily: fontFamily.extrabold, fontSize: 12, color: '#FFFFFF' },
});
