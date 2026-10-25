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
import { Button, fontFamily, homeColors } from '@tarim/ui';
import { DemoBadge } from '../components/DemoBadge';
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
  type HomeCard,
  type HomeRow,
  type HomeTab,
} from './model';

const t = tr.home;

/**
 * Hedef görselden (docs/referans/anasayfa_hedef.png) ölçülen yerleşim, 390 px genişlik için. Ekran
 * genişliğiyle orantılı ölçeklenir (en çok 430 px). Ölçüm yöntemi ve sapmalar: docs/gorsel/ANASAYFA_FARK.md.
 */
export const HOME_LAYOUT = {
  bandH: 125,
  emblem: { x: 7, y: 3, w: 77, h: 97 },
  icon: { cx0: 116.1, pitch: 41.8, cy: 46.1, d: 39.6 },
  strip: { top: 16.1, padL: 7.4, w: 71.2, h: 119.5, gap: 4.9, block: 155.8 },
  farmer: { x: 84.3, w: 53, h: 104 },
  name: { w: 185.4, padTop: 39.5 },
  tabs: { gap: 7.7, ml: 8.7, mr: 7.4, headH: 52.6 },
  rows: { padL: 8.6, padR: 8.1, padTop: 7.4, gap: 12.6, h: 61, date: 61.3, between: 5.6 },
} as const;

/** Ölçek: ekran genişliği / 390 (en çok 430 px'e göre). */
export function useHomeScale(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, 430) / 390;
}

const L = HOME_LAYOUT;

/** Üst bant: amblem + 7 yuvarlak ikon. Üst boşluk safe-area'dan gelir (saat/çentik ile karışmaz). */
export function TopBand({ unread }: { unread: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const k = useHomeScale();
  const top = insets.top;
  const d = L.icon.d * k;
  return (
    <View style={[styles.band, { height: L.bandH * k + top }]} testID="ana-bant">
      {/* Hedefteki açık bölge: üstte x≈210'dan sağ kenarda y≈115'e inen köşegenin sağı. */}
      <View
        style={[
          styles.stripe,
          { left: 140 * k, top: top - 298 * k, width: 600 * k, height: 400 * k },
        ]}
        pointerEvents="none"
      />
      <ImageSlot
        name="amblem.png"
        label={`${t.emblem}: ${tr.app.name}`}
        style={{
          position: 'absolute',
          left: L.emblem.x * k,
          top: top + L.emblem.y * k,
          width: L.emblem.w * k,
          height: L.emblem.h * k,
        }}
        testID="amblem"
      />
      {HOME_ICONS.map((item, i) => (
        <HomeIconButton
          key={item.key}
          item={item}
          size={d}
          pitch={44}
          badge={item.key === 'bildirim' ? unread : undefined}
          onPress={() => router.push(item.route as never)}
          style={{
            position: 'absolute',
            left: (L.icon.cx0 + i * L.icon.pitch) * k - 22,
            top: top + L.icon.cy * k - 22,
          }}
        />
      ))}
      <View style={styles.demo} pointerEvents="none">
        <DemoBadge />
      </View>
    </View>
  );
}

/**
 * Yatay kayan kart şeridi: ~4 sn'de bir bir kart ilerler, dokununca/kaydırınca durur. 5 kart ekrana
 * sığdığı için liste bir kez daha (kopya) çizilir; sona gelince başa sessizce döner (sonsuz döngü).
 * Kart yoksa (boş durum) yalnız yer tutar, içerik göstermez.
 */
export function CardStrip({ items, onOpen }: { items: HomeCard[]; onOpen: (c: HomeCard) => void }) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [paused, setPaused] = useState(false);
  const index = useRef(0);
  const k = useHomeScale();
  const cardW = L.strip.w * k;
  const gap = L.strip.gap * k;
  const step = cardW + gap;
  const shown = items.slice(0, 5);
  const loop = shown.length > 1;

  useEffect(() => {
    if (paused || !loop) return;
    const timer = setInterval(() => {
      index.current = nextCardIndex(index.current, shown.length + 1);
      if (index.current === 0) {
        ref.current?.scrollTo({ x: 0, animated: false });
        index.current = 1;
      }
      ref.current?.scrollTo({ x: index.current * step, animated: true });
    }, CARD_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, loop, shown.length, step]);

  const block = { height: L.strip.block * k, marginTop: L.strip.top * k };
  if (shown.length === 0) return <View style={block} testID="kart-seridi-bos" />;
  const card = (c: HomeCard, i: number, copy: boolean) => (
    <Pressable
      key={`${copy ? 'k' : 'a'}-${c.id}`}
      accessibilityRole="button"
      accessibilityLabel={c.title}
      accessibilityElementsHidden={copy}
      importantForAccessibility={copy ? 'no-hide-descendants' : 'auto'}
      testID={copy ? 'kart-seridi-kopya' : 'kart-seridi-kart'}
      onPress={() => onOpen(c)}
      style={{ width: cardW }}
    >
      <ImageSlot
        name={c.image}
        uri={c.uri}
        label={c.title}
        testID={copy ? undefined : `kart-gorsel-${i + 1}`}
        style={{ width: cardW, height: L.strip.h * k, borderRadius: 9 * k }}
      />
      <Text style={styles.cardTitle} numberOfLines={3}>
        {c.title}
      </Text>
    </Pressable>
  );
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="kart-seridi"
      contentContainerStyle={{ paddingHorizontal: L.strip.padL * k, gap }}
      onTouchStart={() => setPaused(true)}
      onScrollBeginDrag={() => setPaused(true)}
      onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        index.current = Math.round(e.nativeEvent.contentOffset.x / step);
      }}
      style={[styles.strip, block]}
    >
      {shown.map((c, i) => card(c, i, false))}
      {loop ? shown.map((c, i) => card(c, i, true)) : null}
    </ScrollView>
  );
}

/** Çiftçi çizimi + arazi adı (büyük, turkuaz) ve il/ilçe; dokununca arazi değiştirici açılır. */
export function FieldBlock({
  name,
  place,
  onPress,
  canSwitch,
}: {
  /** Arazi yoksa (boş durum) verilmez: yalnız çizim görünür. */
  name?: string;
  place?: string;
  onPress?: () => void;
  canSwitch?: boolean;
}) {
  const k = useHomeScale();
  return (
    <View style={[styles.fieldRow, { height: L.farmer.h * k, paddingLeft: L.farmer.x * k }]}>
      <ImageSlot
        name="ciftci.png"
        label={t.farmer}
        style={{ width: L.farmer.w * k, height: L.farmer.h * k }}
        testID="ciftci"
      />
      {name ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canSwitch ? `${t.switchField}: ${name}` : name}
          testID="arazi-blogu"
          disabled={!canSwitch}
          onPress={onPress}
          style={[styles.fieldText, { width: L.name.w * k, paddingTop: L.name.padTop * k }]}
        >
          <Text style={styles.fieldName} numberOfLines={1} testID="bugun-tarla">
            {name}
          </Text>
          <Text style={styles.fieldName} numberOfLines={1} testID="arazi-yer">
            {place}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Beş sekmeli liste kartı: solda tarih kutusu, sağda açık turkuaz metin kutusu. */
export function TabsCard({
  tab,
  onTab,
  rows,
  empty,
}: {
  tab: HomeTab;
  onTab: (t: HomeTab) => void;
  rows: HomeRow[];
  /** Arazi yokken: sekmeler görünür, gövdede kısa metin + "Tarla ekle" düğmesi (içerik yok). */
  empty?: { onAdd: () => void };
}) {
  const [open, setOpen] = useState<string | null>(null);
  const k = useHomeScale();
  const weights: Record<HomeTab, number> = {
    zaman: 1,
    rehber: 1,
    uyari: 1,
    hibe: 1.65,
    hepsi: 0.95,
  };
  const R = L.rows;
  return (
    <View
      style={[
        styles.tabsCard,
        { marginLeft: L.tabs.ml * k, marginRight: L.tabs.mr * k, marginTop: L.tabs.gap * k },
      ]}
      testID="ana-sekmeli-kart"
    >
      <View style={[styles.tabsHead, { height: L.tabs.headH * k }]} testID="ana-sekme-basligi">
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
      <View
        style={{
          paddingLeft: R.padL * k,
          paddingRight: R.padR * k,
          paddingTop: R.padTop * k,
          paddingBottom: 10,
          gap: R.gap * k,
        }}
      >
        {empty ? (
          <View style={styles.emptyBox} testID="ana-bos-durum">
            <Text style={styles.empty}>{t.empty}</Text>
            <Button label={t.addField} onPress={empty.onAdd} testID="ana-tarla-ekle" />
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.empty} testID="ana-bos">
            {emptyText(tab)}
          </Text>
        ) : (
          rows.map((r, i) => {
            const d = dateBox(r.date);
            return (
              <View key={r.id}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${d.month} ${d.day} ${d.year}: ${r.title}`}
                  testID="liste-satiri"
                  onPress={() => setOpen(open === r.id ? null : r.id)}
                  style={[styles.row, { minHeight: R.h * k, gap: R.between * k }]}
                >
                  <View
                    style={[styles.dateBox, { width: R.date * k }]}
                    testID={i === 0 ? 'tarih-kutusu' : undefined}
                  >
                    <Text style={styles.dateText}>{d.month}</Text>
                    <Text style={styles.dateText}>{d.day}</Text>
                    <Text style={styles.dateText}>{d.year}</Text>
                  </View>
                  <View style={styles.rowBox} testID={i === 0 ? 'satir-kutusu' : undefined}>
                    <Text style={styles.rowText} numberOfLines={3}>
                      {r.title}
                    </Text>
                  </View>
                </Pressable>
                {open === r.id ? (
                  <View
                    style={[styles.detail, { marginLeft: (R.date + R.between) * k }]}
                    testID="satir-detay"
                  >
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
  const k = useHomeScale();
  if (count <= 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.attention}: ${count}`}
      testID="dikkat-rozeti"
      onPress={onPress}
      style={[styles.attentionTouch, { top: insets.top + (L.bandH + 4) * k }]}
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
  band: { backgroundColor: homeColors.band, overflow: 'hidden' },
  stripe: {
    position: 'absolute',
    backgroundColor: homeColors.bandStripe,
    transform: [{ rotate: '32deg' }],
  },
  demo: { position: 'absolute', right: 6, bottom: 6 },
  strip: { flexGrow: 0 },
  cardTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 11,
    paddingTop: 4,
    color: homeColors.text,
    textAlign: 'center',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start' },
  fieldText: { alignItems: 'center' },
  fieldName: {
    fontFamily: fontFamily.medium,
    fontSize: 19,
    lineHeight: 22,
    color: homeColors.name,
    textAlign: 'center',
  },
  tabsCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tabsHead: { flexDirection: 'row', backgroundColor: homeColors.band },
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
  row: { flexDirection: 'row' },
  dateBox: {
    backgroundColor: homeColors.dateBox,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dateText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 17,
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
  detail: { marginTop: 6, gap: 2 },
  detailText: { fontFamily: fontFamily.medium, fontSize: 13, color: homeColors.text },
  detailSource: { fontFamily: fontFamily.medium, fontSize: 12, color: '#4F6258' },
  emptyBox: { gap: 12, paddingVertical: 12 },
  empty: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: homeColors.text,
    textAlign: 'center',
    paddingVertical: 6,
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
