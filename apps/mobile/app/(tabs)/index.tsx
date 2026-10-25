import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Durum, fontFamily, homeColors } from '@tarim/ui';
import type { AnnouncementDto } from '../../src/api/client';
import { DemoBadge } from '../../src/components/DemoBadge';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { loadHome, type HomeData } from '../../src/home/load';
import {
  AttentionBadge,
  CardStrip,
  FieldBlock,
  SideMenu,
  TabsCard,
  TopBand,
} from '../../src/home/HomeParts';
import {
  attentionCount,
  buildHomeRows,
  placeLine,
  rowsForTab,
  type HomeTab,
} from '../../src/home/model';
import { tr } from '../../src/i18n/tr';
import { kv } from '../../src/offline/kvStore';
import { loadSeen, notificationItems, unreadCount } from '../../src/notifications/state';
import { registerForPush } from '../../src/push';
import { api } from '../../src/session';

const t = tr.today;

/**
 * Ana sayfa (docs/ANASAYFA_SPEC.md, hedef: docs/referans/anasayfa_hedef.png): turkuaz bant + 7 ikon,
 * kayan kart şeridi, arazi adı, 5 sekmeli liste. Hava, don ve sulama özetleri ilgili ikonun altındaki
 * sayfalardadır (Hava Durumu, Arazi İşlemleri).
 */
export default function HomeScreen() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [state, setState] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
  const [tab, setTab] = useState<HomeTab>('hepsi');
  const [picking, setPicking] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);

  const load = useCallback(async (pick?: string) => {
    try {
      const r = await loadHome(api, kv, pick);
      setData(r);
      setState(r ? 'ready' : 'empty');
      setSeen(await loadSeen(kv));
      if (r) void registerForPush(api);
    } catch {
      setState('error');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const rows = useMemo(
    () =>
      data
        ? buildHomeRows({
            calendar: data.calendar,
            today: data.base.today,
            supports: data.supports,
            announcements: data.announcements,
          })
        : [],
    [data],
  );
  const unread = useMemo(
    () => (data ? unreadCount(notificationItems(data.base.today, data.announcements), seen) : 0),
    [data, seen],
  );
  const cards = useMemo(() => (data?.announcements ?? []).filter((a) => !a.needsBadge), [data]);

  const openCard = (a: AnnouncementDto) =>
    router.push({ pathname: '/haber', params: { id: a.id, fieldId: data?.base.field.id } });

  const goSide = (key: 'arazi' | 'uretim' | 'takvim') => {
    const fieldId = data?.base.field.id;
    if (key === 'arazi') return router.push('/tarlalarim');
    if (key === 'uretim') return router.push('/uretim-plani');
    return router.push({ pathname: '/takvim', params: { fieldId } });
  };

  const field = data?.base.field;
  return (
    <View style={styles.root}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <TopBand unread={unread} />
        <DemoBadge />
        {state === 'loading' ? <Durum kind="yukleniyor" text={t.loading} /> : null}
        {state === 'error' ? (
          <View style={styles.pad}>
            <SunucuKarti onRetry={() => void load()} />
          </View>
        ) : null}
        {state === 'empty' ? (
          <View style={styles.pad}>
            <Durum
              kind="bos"
              text={`${t.noField} ${t.noFieldHint}`}
              action={{ label: t.addField, onPress: () => router.push('/tarla-ekle') }}
            />
          </View>
        ) : null}
        {state === 'ready' && data && field ? (
          <>
            <CardStrip items={cards} onOpen={openCard} />
            <FieldBlock
              name={field.name}
              place={placeLine(field)}
              canSwitch={data.fields.length > 1}
              onPress={() => setPicking((v) => !v)}
            />
            {picking ? (
              <View style={styles.picker} testID="arazi-secici">
                {data.fields.map((f) => (
                  <Pressable
                    key={f.id}
                    accessibilityRole="button"
                    accessibilityLabel={f.name}
                    testID="arazi-secenek"
                    onPress={() => {
                      setPicking(false);
                      void load(f.id === field.id ? undefined : f.id);
                    }}
                    style={styles.pickRow}
                  >
                    <Text style={[styles.pickText, f.id === field.id && styles.pickOn]}>
                      {f.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TabsCard tab={tab} onTab={setTab} rows={rowsForTab(rows, tab)} />
            {data.base.offline ? <Text style={styles.note}>{t.offline}</Text> : null}
          </>
        ) : null}
      </ScrollView>
      <AttentionBadge count={attentionCount(rows)} onPress={() => setTab('uyari')} />
      <SideMenu onGo={goSide} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.page },
  content: { paddingBottom: 12 },
  pad: { padding: 12 },
  picker: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9DEE0',
  },
  pickRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  pickText: { fontFamily: fontFamily.semibold, fontSize: 15, color: homeColors.text },
  pickOn: { fontFamily: fontFamily.extrabold, color: homeColors.name },
  note: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#4F6258',
    textAlign: 'center',
    paddingBottom: 8,
  },
});
