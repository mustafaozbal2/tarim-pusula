import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Glyph } from '../src/components/HomeIcons';
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
  const router = useRouter();

  const load = useCallback(async () => {
    let list: NotificationItem[];
    setFailed(false);
    try {
      list = await withDeadline(
        (async () => {
          // G24: uzman cevabı gibi kişisel bildirimler sunucu kutusundan (arazi olmasa da görünür).
          const [r, inbox] = await Promise.all([loadToday(api, kv), api.inbox().catch(() => [])]);
          const anns = r ? await loadAnnouncements(api, kv, r.field.id) : [];
          return notificationItems(r?.today ?? null, anns, inbox);
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
    void api.inboxRead().catch(() => undefined);
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
        {/* Çizimle zil (görseldeki sabit "1" rozeti gerçek sayıyla çelişiyordu). */}
        <View style={styles.heroIcon}>
          <Glyph k="bildirim" size={42} />
          {items && unreadKeys.size > 0 ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {unreadKeys.size > 9 ? '9+' : String(unreadKeys.size)}
              </Text>
            </View>
          ) : null}
        </View>
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
                <Pressable
                  accessibilityRole={n.id.startsWith('uzman-') ? 'button' : 'text'}
                  key={n.key}
                  style={[styles.card, look.kind === 'uyari' && styles.cardWarn]}
                  testID="liste-satiri"
                  accessibilityLabel={`${n.title}${unread ? `, ${t.unread}` : ''}`}
                  // Uzman cevabı: dokununca Sorularım (cevabın tamamı ve dayanağı).
                  onPress={n.id.startsWith('uzman-') ? () => router.push('/sorularim') : undefined}
                  disabled={!n.id.startsWith('uzman-')}
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
                </Pressable>
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
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: homeColors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeText: { fontFamily: fontFamily.extrabold, fontSize: 12, color: '#FFFFFF' },
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
