import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily, homeColors } from '@tarim/ui';
import type { AnnouncementDto } from '../api/client';
import type { ImageName } from '../assets';
import { HOME_ICONS, HomeIconButton } from '../components/HomeIcons';
import { Icon } from '../components/Icon';
import { ImageSlot } from '../components/ImageSlot';
import { tr } from '../i18n/tr';
import {
  CARD_INTERVAL_MS,
  dateBox,
  emptyText,
  HOME_TABS,
  nextCardIndex,
  type HomeRow,
  type HomeTab,
} from './model';

const t = tr.home;

/** Üst bant: amblem + 7 yuvarlak ikon. Üst boşluk safe-area'dan gelir (saat/çentik ile karışmaz). */
export function TopBand({ unread }: { unread: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const w = Math.min(width, 430);
  // Hedefte daire 38 px, merkezler arası 41 px; dar ekranda ikisi de küçülür.
  const pitch = Math.min(41, Math.floor((w - 20 - 78) / 7));
  const size = Math.min(38, pitch - 3);
  return (
    <View style={[styles.band, { paddingTop: Math.max(insets.top, 12) + 4 }]} testID="ana-bant">
      <View style={styles.stripe} pointerEvents="none" />
      <View style={styles.brand}>
        <ImageSlot name="amblem.png" label={t.emblem} style={styles.emblem} testID="amblem" />
        <Text
          style={styles.brandText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {tr.app.name.toLocaleUpperCase('tr-TR')}
        </Text>
      </View>
      <View style={styles.icons}>
        {HOME_ICONS.map((item) => (
          <HomeIconButton
            key={item.key}
            item={item}
            size={size}
            pitch={pitch}
            badge={item.key === 'bildirim' ? unread : undefined}
            onPress={() => router.push(item.route as never)}
          />
        ))}
      </View>
    </View>
  );
}

/** Yatay kayan 5 kartlı şerit: ~4 sn'de bir kendiliğinden ilerler, dokununca/kaydırınca durur. */
export function CardStrip({
  items,
  onOpen,
}: {
  items: AnnouncementDto[];
  onOpen: (a: AnnouncementDto) => void;
}) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [paused, setPaused] = useState(false);
  const index = useRef(0);
  const { width } = useWindowDimensions();
  const cardW = 76;
  const gap = 6;
  const step = cardW + gap;
  const shown = items.slice(0, 5);
  const visible = Math.max(1, Math.floor((Math.min(width, 430) - 20) / step));
  // Son kart görününce başa döner.
  const slots = Math.max(1, shown.length - visible + 1);

  useEffect(() => {
    if (paused || shown.length <= visible) return;
    const timer = setInterval(() => {
      index.current = nextCardIndex(index.current, slots);
      ref.current?.scrollTo({ x: index.current * step, animated: true });
    }, CARD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, shown.length, visible, slots, step]);

  if (shown.length === 0) {
    return (
      <View style={styles.stripEmpty}>
        <Text style={styles.stripEmptyText}>{t.noCards}</Text>
      </View>
    );
  }
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="kart-seridi"
      contentContainerStyle={{ paddingHorizontal: 10, gap }}
      onTouchStart={() => setPaused(true)}
      onScrollBeginDrag={() => setPaused(true)}
      onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        index.current = Math.round(e.nativeEvent.contentOffset.x / step);
      }}
      style={styles.strip}
    >
      {shown.map((a, i) => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={a.title}
          testID="kart-seridi-kart"
          onPress={() => onOpen(a)}
          style={{ width: cardW }}
        >
          <ImageSlot
            name={`kart_${i + 1}.jpg` as ImageName}
            uri={a.imageDataUrl}
            label={a.title}
            style={styles.cardImage}
          />
          <Text style={styles.cardTitle} numberOfLines={3}>
            {a.title}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Arazi adı (büyük, turkuaz) + il/ilçe; dokununca arazi değiştirici açılır. */
export function FieldBlock({
  name,
  place,
  onPress,
  canSwitch,
}: {
  name: string;
  place: string;
  onPress: () => void;
  canSwitch: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <ImageSlot name="ciftci.png" label={t.farmer} style={styles.farmer} testID="ciftci" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canSwitch ? `${t.switchField}: ${name}` : name}
        testID="arazi-blogu"
        disabled={!canSwitch}
        onPress={onPress}
        style={styles.fieldText}
      >
        <Text style={styles.fieldName} numberOfLines={2} testID="bugun-tarla">
          {name}
        </Text>
        <Text style={styles.fieldPlace} numberOfLines={1} testID="arazi-yer">
          {place}
        </Text>
      </Pressable>
    </View>
  );
}

/** Beş sekmeli liste kartı: solda tarih kutusu, sağda açık turkuaz metin kutusu. */
export function TabsCard({
  tab,
  onTab,
  rows,
}: {
  tab: HomeTab;
  onTab: (t: HomeTab) => void;
  rows: HomeRow[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const weights: Record<HomeTab, number> = { zaman: 1, rehber: 1, uyari: 1, hibe: 1.5, hepsi: 0.9 };
  return (
    <View style={styles.tabsCard} testID="ana-sekmeli-kart">
      <View style={styles.tabsHead}>
        {HOME_TABS.map((x, i) => {
          const on = x.key === tab;
          return (
            <Pressable
              key={x.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={x.label}
              testID={`sekme-${x.key}`}
              onPress={() => {
                setOpen(null);
                onTab(x.key);
              }}
              style={[
                styles.tabBtn,
                { flex: weights[x.key] },
                on && styles.tabBtnOn,
                i > 0 && styles.tabDivider,
              ]}
            >
              <Text style={[styles.tabText, x.key === 'hepsi' && styles.tabTextAll]}>
                {x.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.rows}>
        {rows.length === 0 ? (
          <Text style={styles.empty} testID="ana-bos">
            {emptyText(tab)}
          </Text>
        ) : (
          rows.map((r) => {
            const d = dateBox(r.date);
            return (
              <View key={r.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${d.month} ${d.day} ${d.year}: ${r.title}`}
                  testID="liste-satiri"
                  onPress={() => setOpen(open === r.id ? null : r.id)}
                  style={styles.row}
                >
                  <View style={styles.dateBox}>
                    <Text style={styles.dateText}>{d.month}</Text>
                    <Text style={styles.dateText}>{d.day}</Text>
                    <Text style={styles.dateText}>{d.year}</Text>
                  </View>
                  <View style={styles.rowBox}>
                    <Text style={styles.rowText} numberOfLines={3}>
                      {r.title}
                    </Text>
                  </View>
                </Pressable>
                {open === r.id ? (
                  <View style={styles.detail} testID="satir-detay">
                    {r.detail ? <Text style={styles.detailText}>{r.detail}</Text> : null}
                    <Text style={styles.detailSource}>
                      {tr.common.source}: {r.source}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

/** Sol köşe "Dikkat" rozeti: yalnız aktif ve onaylı uyarı varken çizilir. */
export function AttentionBadge({ count, onPress }: { count: number; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  if (count <= 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.attention}: ${count}`}
      testID="dikkat-rozeti"
      onPress={onPress}
      style={[styles.attentionTouch, { top: Math.max(insets.top, 12) + 4 + 100 }]}
    >
      <View style={styles.attention}>
        <Icon name="warning" size={16} color="#FFFFFF" />
        <Text style={styles.attentionText}>{t.attention}</Text>
      </View>
    </Pressable>
  );
}

/** Sağ kenar açılır-kapanır menü: Arazi, Üretim planı, Takvim. Ana düzeni bozmaz (üstte durur). */
export function SideMenu({ onGo }: { onGo: (key: 'arazi' | 'uretim' | 'takvim') => void }) {
  const [open, setOpen] = useState(false);
  const items = [
    { key: 'arazi', label: t.side.fields, icon: 'map' },
    { key: 'uretim', label: t.side.plan, icon: 'plan' },
    { key: 'takvim', label: t.side.calendar, icon: 'calendar' },
  ] as const;
  return (
    <View style={styles.side} pointerEvents="box-none" testID="yan-menu">
      {open ? (
        <View style={styles.sidePanel} testID="yan-menu-panel">
          {items.map((it) => (
            <Pressable
              key={it.key}
              accessibilityRole="button"
              accessibilityLabel={it.label}
              testID={`yan-${it.key}`}
              onPress={() => {
                setOpen(false);
                onGo(it.key);
              }}
              style={styles.sideItem}
            >
              <Icon name={it.icon} size={20} color="#FFFFFF" />
              <Text style={styles.sideText}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? t.side.close : t.side.open}
        accessibilityState={{ expanded: open }}
        testID="yan-menu-tutamac"
        onPress={() => setOpen((v) => !v)}
        style={[styles.handleTouch, open && { width: 18 }]}
      >
        <View style={styles.handle}>
          <Icon name={open ? 'chevronRight' : 'back'} size={16} color="#FFFFFF" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    backgroundColor: homeColors.band,
    paddingBottom: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  stripe: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: 40,
    height: 70,
    backgroundColor: homeColors.bandStripe,
    transform: [{ rotate: '-8deg' }],
  },
  brand: { alignItems: 'center', width: 78 },
  emblem: { width: 62, height: 62, borderRadius: 31 },
  brandText: {
    fontFamily: fontFamily.extrabold,
    fontSize: 12,
    color: homeColors.text,
    marginTop: 4,
  },
  icons: { flexDirection: 'row', alignItems: 'center', marginTop: 10, flexShrink: 1 },
  strip: { flexGrow: 0, marginTop: 14 },
  stripEmpty: { paddingHorizontal: 12, paddingVertical: 18 },
  stripEmptyText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: homeColors.text,
    textAlign: 'center',
  },
  cardImage: { width: 76, height: 118, borderRadius: 12 },
  cardTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 14,
    color: homeColors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 4,
    gap: 16,
    minHeight: 104,
  },
  farmer: { width: 72, height: 100 },
  fieldText: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  fieldName: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    lineHeight: 24,
    color: homeColors.name,
    textAlign: 'center',
  },
  fieldPlace: {
    fontFamily: fontFamily.medium,
    fontSize: 20,
    lineHeight: 24,
    color: homeColors.name,
    textAlign: 'center',
  },
  tabsCard: {
    marginHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  tabsHead: { flexDirection: 'row', backgroundColor: homeColors.band, minHeight: 53 },
  tabBtn: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBtnOn: { backgroundColor: homeColors.tabSelected },
  tabDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(35,31,32,0.55)' },
  tabText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 15,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tabTextAll: { fontFamily: fontFamily.extrabold, fontSize: 14 },
  rows: { padding: 10, gap: 10 },
  row: { flexDirection: 'row', gap: 8, minHeight: 60 },
  dateBox: {
    width: 60,
    backgroundColor: homeColors.dateBox,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dateText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 15,
    color: homeColors.text,
    textAlign: 'center',
  },
  rowBox: {
    flex: 1,
    backgroundColor: homeColors.rowBox,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    color: homeColors.text,
    textAlign: 'center',
  },
  detail: { marginTop: 6, marginLeft: 68, gap: 2 },
  detailText: { fontFamily: fontFamily.medium, fontSize: 13, color: homeColors.text },
  detailSource: { fontFamily: fontFamily.medium, fontSize: 12, color: '#4F6258' },
  empty: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: homeColors.text,
    textAlign: 'center',
    paddingVertical: 18,
  },
  attentionTouch: {
    position: 'absolute',
    left: 0,
    height: 44,
    justifyContent: 'center',
    paddingRight: 12,
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: homeColors.badgeDot,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 8,
  },
  attentionText: { fontFamily: fontFamily.extrabold, fontSize: 12, color: '#FFFFFF' },
  side: {
    position: 'absolute',
    right: 0,
    top: '42%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  handleTouch: { width: 44, height: 56, alignItems: 'flex-end', justifyContent: 'center' },
  handle: {
    width: 18,
    height: 56,
    backgroundColor: homeColors.tabSelected,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePanel: {
    backgroundColor: homeColors.tabSelected,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
  },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 120 },
  sideText: { fontFamily: fontFamily.bold, fontSize: 14, color: '#FFFFFF' },
});
