import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, radius, spacing } from '@tarim/ui';
import type { AnnouncementDto, FieldDto } from '../../src/api/client';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import { registerForPush } from '../../src/push';
import { api } from '../../src/session';
import { loadAnnouncements } from '../../src/today/announcements';
import { FIELDS_CACHE, loadToday, nextFieldId, type TodayResult } from '../../src/today/load';
import { clock, frostCardModel, waterNeedText, weatherText } from '../../src/today/model';

const t = tr.today;

export default function TodayScreen() {
  const router = useRouter();
  const [data, setData] = useState<TodayResult | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
  const [showWhy, setShowWhy] = useState(false);
  const [news, setNews] = useState<AnnouncementDto[]>([]);

  const load = useCallback(async (pick?: string) => {
    try {
      const r = await loadToday(api, kv, pick);
      setData(r);
      setState(r ? 'ready' : 'empty');
      if (r) {
        void registerForPush(api);
        void loadAnnouncements(api, kv, r.field.id).then(setNews);
      }
    } catch {
      setState('error');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const switchField = async () => {
    if (!data) return;
    const raw = await kv.get(FIELDS_CACHE);
    const fields = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [data.field];
    setShowWhy(false);
    await load(nextFieldId(fields, data.field.id));
  };

  if (state !== 'ready' || !data) {
    return (
      <Screen>
        <Header />
        {state === 'loading' ? <Text style={styles.muted}>{t.loading}</Text> : null}
        {state === 'error' ? <Text style={styles.muted}>{t.frostUnavailable}</Text> : null}
        {state === 'empty' ? (
          <>
            <Text style={styles.strong}>{t.noField}</Text>
            <Text style={styles.muted}>{t.noFieldHint}</Text>
            <Button label={t.addField} onPress={() => router.push('/tarla-ekle')} />
          </>
        ) : null}
      </Screen>
    );
  }

  const { today, field } = data;
  const frost = frostCardModel(today.frost);
  const water = waterNeedText(today.waterNeed);
  const temp = today.weather.current?.tempC;
  const warn = frost.kind === 'warning' || frost.kind === 'watch';

  return (
    <Screen>
      <Header />

      <Card style={styles.fieldRow}>
        <Icon name="pin" />
        <Text style={styles.fieldName} testID="bugun-tarla">
          {field.name}
        </Text>
        <Icon name="chevronDown" size={22} />
      </Card>
      <Button label={t.nextField} variant="secondary" onPress={() => void switchField()} />

      <View style={styles.weather}>
        <View>
          <Text style={styles.temp} testID="bugun-sicaklik">
            {temp === undefined ? '--' : `${Math.round(temp)}°`}
          </Text>
          <Text style={styles.weatherText}>{weatherText(today.weather.current?.weatherCode)}</Text>
          <Text style={styles.weatherSub}>
            {t.minMax
              .replace('{{min}}', String(Math.round(today.weather.today.tMinC)))
              .replace('{{max}}', String(Math.round(today.weather.today.tMaxC)))}
          </Text>
        </View>
        <Icon name="sun" size={64} color={colors.amber} />
      </View>

      <View style={[styles.alert, !warn && styles.calm]} testID="bugun-don-karti">
        <View style={styles.alertHead}>
          <Icon name="warning" size={22} color={colors.amberText} />
          <Text style={styles.alertLabel}>{warn ? t.attention : t.frostLabel}</Text>
        </View>
        <Text style={styles.alertTitle} testID="bugun-don-baslik">
          {frost.title}
        </Text>
        <Text style={styles.alertBody}>{frost.body}</Text>
        {frost.kind === 'pending' ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t.pendingBadge}</Text>
          </View>
        ) : null}
        {frost.kind === 'warning' || frost.kind === 'watch' ? (
          <>
            <Button
              label={t.frostWhy}
              variant="secondary"
              style={{ marginTop: spacing.lg }}
              onPress={() => setShowWhy((v) => !v)}
            />
            {showWhy ? <Text style={styles.alertBody}>{frost.why}</Text> : null}
          </>
        ) : null}
        <Text style={styles.alertSource}>
          {t.frostSource}: {today.frost.source} · {clock(today.frost.fetchedAt)}
        </Text>
      </View>

      <View style={styles.task}>
        <View style={[styles.taskIcon, { backgroundColor: colors.waterSoft }]}>
          <Icon name="drop" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.taskLabel}>{t.waterTitle}</Text>
          <Text style={styles.muted} testID="bugun-su">
            {water ?? t.waterNone}
          </Text>
        </View>
      </View>

      {news.length > 0 ? (
        <View testID="bugun-duyurular" style={{ gap: spacing.md }}>
          <Text style={styles.strong}>{t.announcements}</Text>
          {news.map((a) => (
            <Card key={a.id}>
              <Text style={styles.taskLabel}>{a.title}</Text>
              <Text style={styles.alertBody}>{a.body}</Text>
              {a.needsBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t.announcementPending}</Text>
                </View>
              ) : null}
              <Text style={styles.muted}>
                {tr.common.source}: {a.sourceOrg} · {t.announcementPublished}:{' '}
                {new Date(a.publishedAt).toLocaleDateString('tr-TR')}
              </Text>
              <Text style={styles.muted}>{a.why}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      {data.offline ? <Text style={styles.muted}>{t.offline}</Text> : null}
      {today.weather.stale && !data.offline ? <Text style={styles.muted}>{t.stale}</Text> : null}
      <Text style={styles.muted} testID="bugun-guncelleme">
        {t.lastUpdate}: {clock(data.at)} · {tr.common.source}: {today.weather.source}
      </Text>

      <View style={styles.actions}>
        <Button label={t.askByVoice} style={{ flex: 1 }} />
        <Button label={t.takePhoto} variant="secondary" />
      </View>
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Icon name="compass" size={22} color={colors.amber} />
      </View>
      <Text style={styles.appName}>{tr.app.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontFamily: fontFamily.extrabold, fontSize: 19, color: colors.forest },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 0,
  },
  fieldName: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  weather: {
    backgroundColor: colors.forest,
    borderRadius: radius.card,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  temp: { fontFamily: fontFamily.extrabold, fontSize: 56, lineHeight: 60, color: '#FFFFFF' },
  weatherText: { fontFamily: fontFamily.semibold, fontSize: 18, color: '#CFE0D6', marginTop: 6 },
  weatherSub: { fontFamily: fontFamily.semibold, fontSize: 16, color: '#CFE0D6', marginTop: 4 },
  alert: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 2,
    borderRadius: radius.card,
    padding: spacing.xl,
  },
  calm: { backgroundColor: colors.pistachio, borderColor: colors.border },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertLabel: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.amberText },
  alertTitle: { fontFamily: fontFamily.extrabold, fontSize: 24, color: '#3B2700', marginTop: 6 },
  alertBody: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    color: colors.amberText,
    marginTop: 6,
    lineHeight: 26,
  },
  alertSource: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.amberText,
    marginTop: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: colors.amberSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.amberText },
  task: {
    minHeight: 64,
    borderRadius: radius.row,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskLabel: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.textMuted },
  strong: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.forest },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
});
