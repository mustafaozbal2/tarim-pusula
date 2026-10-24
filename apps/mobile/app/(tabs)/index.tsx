import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  colors,
  Durum,
  fontFamily,
  fontSize,
  HizliErisimSeridi,
  Rozet,
  SekmeAnahtari,
  spacing,
  TarihBasliSatir,
} from '@tarim/ui';
import type { AnnouncementDto, FieldDto } from '../../src/api/client';
import { AnnouncementCard } from '../../src/components/AnnouncementCard';
import { Icon, type IconName } from '../../src/components/Icon';
import { KonumHavaBasligi } from '../../src/components/KonumHavaBasligi';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import { registerForPush } from '../../src/push';
import { api } from '../../src/session';
import { loadAnnouncements } from '../../src/today/announcements';
import { FIELDS_CACHE, loadToday, nextFieldId, type TodayResult } from '../../src/today/load';
import { clock, frostCardModel, waterNeedText, weatherText } from '../../src/today/model';
import { buildNotifications } from '../../src/today/notifications';

const t = tr.today;
type Tab = 'duyurular' | 'bildirimler';

/** Hızlı erişim: eski uygulamadaki 6 ana özellik. */
const QUICK: { key: string; label: string; icon: IconName }[] = [
  { key: 'arazi', label: t.quick.fields, icon: 'map' },
  { key: 'uretim', label: t.quick.plan, icon: 'plan' },
  { key: 'takvim', label: t.quick.calendar, icon: 'calendar' },
  { key: 'uyari', label: t.quick.warning, icon: 'warning' },
  { key: 'cihaz', label: t.quick.devices, icon: 'chip' },
  { key: 'uzman', label: t.quick.expert, icon: 'spark' },
];

export default function TodayScreen() {
  const router = useRouter();
  const [data, setData] = useState<TodayResult | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
  const [showWhy, setShowWhy] = useState(false);
  const [news, setNews] = useState<AnnouncementDto[]>([]);
  const [fieldCount, setFieldCount] = useState(0);
  const [tab, setTab] = useState<Tab>('duyurular');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (pick?: string) => {
    try {
      const r = await loadToday(api, kv, pick);
      setData(r);
      setState(r ? 'ready' : 'empty');
      if (r) {
        void registerForPush(api);
        void loadAnnouncements(api, kv, r.field.id).then((list) => {
          setNews(list);
          setOpen(null);
        });
        void kv.get(FIELDS_CACHE).then((raw) => {
          setFieldCount(raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields.length : 1);
        });
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

  const notifications = useMemo(() => (data ? buildNotifications(data.today) : []), [data]);

  const go = (key: string) => {
    const fieldId = data?.field.id;
    switch (key) {
      case 'arazi':
        return router.push('/tarlalarim');
      case 'uretim':
        return router.push('/pazar');
      case 'takvim':
        return router.push({ pathname: '/takvim', params: { fieldId } });
      case 'uyari':
        return router.push({ pathname: '/ndvi', params: { fieldId } });
      case 'cihaz':
        return router.push('/sulama');
      default:
        return router.push('/soru-sor');
    }
  };
  const quick = (
    <HizliErisimSeridi
      testID="bugun-hizli"
      items={QUICK.map((q) => ({
        key: q.key,
        label: q.label,
        icon: <Icon name={q.icon} size={22} color={colors.forest} />,
        onPress: () => go(q.key),
      }))}
    />
  );

  if (state !== 'ready' || !data) {
    return (
      <Screen
        hero={
          <KonumHavaBasligi
            location={tr.app.name.toLocaleUpperCase('tr-TR')}
            temp="--"
            onSettings={() => router.push('/ayarlar')}
          />
        }
      >
        {state === 'loading' ? <Durum kind="yukleniyor" text={t.loading} /> : null}
        {state === 'error' ? <SunucuKarti onRetry={() => void load()} /> : null}
        {state === 'empty' ? (
          <Durum
            kind="bos"
            text={`${t.noField} ${t.noFieldHint}`}
            action={{ label: t.addField, onPress: () => router.push('/tarla-ekle') }}
          />
        ) : null}
        {quick}
      </Screen>
    );
  }

  const { today, field } = data;
  const frost = frostCardModel(today.frost);
  const water = waterNeedText(today.waterNeed);
  const temp = today.weather.current?.tempC;
  const warn = frost.kind === 'warning' || frost.kind === 'watch';
  const place = field.village ?? field.district ?? field.province ?? field.name;

  return (
    <Screen
      hero={
        <KonumHavaBasligi
          onSettings={() => router.push('/ayarlar')}
          location={place.toLocaleUpperCase('tr-TR')}
          temp={temp === undefined ? '--' : `${Math.round(temp)}°`}
          tempTestID="bugun-sicaklik"
          summary={weatherText(today.weather.current?.weatherCode)}
          fieldName={field.name}
          onSwitchField={fieldCount > 1 ? () => void switchField() : undefined}
        />
      }
    >
      {/* Tek ince uyarı bandı: onaysız eşikte yalnız bilgi + rozet (değişmez kural 1). */}
      <View style={[styles.band, warn && styles.bandWarn]} testID="bugun-don-karti">
        <View style={styles.bandHead}>
          <Icon name="warning" size={18} color={colors.amberText} />
          <Text style={styles.bandLabel}>{warn ? t.attention : t.frostLabel}</Text>
          <Text style={styles.bandTitle} testID="bugun-don-baslik" numberOfLines={2}>
            {frost.title}
          </Text>
        </View>
        {warn ? (
          <View style={styles.bandRow}>
            <Text style={[styles.bandBody, { flex: 1 }]}>{frost.body}</Text>
            <Button label={t.frostWhy} variant="secondary" onPress={() => setShowWhy((v) => !v)} />
          </View>
        ) : null}
        {warn && showWhy ? <Text style={styles.bandBody}>{frost.why}</Text> : null}
        {frost.kind === 'pending' ? <Rozet label={t.pendingBadge} /> : null}
        <Text style={styles.bandSource}>
          {t.frostSource}: {today.frost.source} · {clock(today.frost.fetchedAt)}
        </Text>
      </View>

      <Card style={styles.listCard}>
        <SekmeAnahtari<Tab>
          testID="bugun-sekmeler"
          value={tab}
          onChange={setTab}
          options={[
            { key: 'duyurular', label: t.announcements },
            { key: 'bildirimler', label: tr.common.notifications },
          ]}
        />
        {tab === 'duyurular' ? (
          news.length > 0 ? (
            <View testID="bugun-duyurular" style={styles.list}>
              {news.map((a) => (
                <View key={a.id} style={styles.list}>
                  <TarihBasliSatir
                    testID="liste-satiri"
                    date={a.publishedAt}
                    title={a.title}
                    badge={a.needsBadge ? t.announcementPending : undefined}
                    onPress={() => setOpen(open === a.id ? null : a.id)}
                  />
                  {open === a.id ? <AnnouncementCard a={a} /> : null}
                </View>
              ))}
            </View>
          ) : (
            <Durum kind="bos" text={t.noAnnouncements} />
          )
        ) : (
          <View testID="bugun-bildirimler" style={styles.list}>
            {notifications.map((n) => (
              <TarihBasliSatir
                key={n.id}
                testID="liste-satiri"
                date={n.date}
                title={n.title}
                tone={n.tone}
              />
            ))}
          </View>
        )}
      </Card>

      {quick}

      <View style={styles.meta}>
        <Text style={styles.muted} testID="bugun-su">
          {t.waterTitle}: {water ?? t.waterNone}
        </Text>
        {data.offline ? <Text style={styles.muted}>{t.offline}</Text> : null}
        {today.weather.stale && !data.offline ? <Text style={styles.muted}>{t.stale}</Text> : null}
        <Text style={styles.muted} testID="bugun-guncelleme">
          {t.lastUpdate}: {clock(data.at)} · {tr.common.source}: {today.weather.source}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.pistachio,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  bandWarn: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bandLabel: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.caption,
    color: colors.amberText,
  },
  bandTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.small,
    color: colors.forest,
  },
  bandBody: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.amberText },
  bandSource: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  listCard: { padding: spacing.md, gap: spacing.md, borderRadius: 12 },
  list: { gap: spacing.sm },
  meta: { gap: 2 },
  muted: { fontFamily: fontFamily.semibold, fontSize: fontSize.caption, color: colors.textMuted },
});
