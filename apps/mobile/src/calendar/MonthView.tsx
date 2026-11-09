import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, fontSize, homeColors, spacing } from '@tarim/ui';
import type { CalendarEventDto } from '../api/client';
import type { Not } from '../notlar/notlar';
import { Icon } from '../components/Icon';
import { tr } from '../i18n/tr';
import { eventsOnDate, monthGrid, monthTitle, shiftMonth, WEEKDAYS } from './month';
import { rangeText } from './model';

const t = tr.calendar;

/**
 * Gerçek ay görünümü: Pazartesi başlar, faaliyet olan günlerde işaret (nokta), güne dokununca o günün
 * işleri alt satırda. Yalnız onaylı faaliyetler işaretlenir.
 */
export function MonthView({
  events,
  today,
  notlar = [],
  notEkle,
  notSil,
}: {
  events: readonly CalendarEventDto[];
  today: string;
  /** Çiftçinin kendi notları (altın nokta). */
  notlar?: readonly Not[];
  notEkle?: (tarih: string, metin: string) => void;
  notSil?: (id: string) => void;
}) {
  const [yaziyor, setYaziyor] = useState(false);
  const [notMetni, setNotMetni] = useState('');
  const notGunleri = useMemo(() => new Set(notlar.map((n) => n.tarih)), [notlar]);
  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [picked, setPicked] = useState<string | null>(today);
  const weeks = useMemo(
    () => monthGrid(ym.year, ym.month, events, today),
    [ym.year, ym.month, events, today],
  );
  const day = picked ? eventsOnDate(events, picked) : [];

  return (
    <View style={styles.box} testID="takvim-ay">
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.prevMonth}
          testID="ay-onceki"
          onPress={() => setYm((v) => shiftMonth(v.year, v.month, -1))}
          style={styles.nav}
        >
          <Icon name="back" size={20} color={colors.forest} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title} testID="ay-baslik">
          {monthTitle(ym.year, ym.month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.nextMonth}
          testID="ay-sonraki"
          onPress={() => setYm((v) => shiftMonth(v.year, v.month, 1))}
          style={styles.nav}
        >
          <Icon name="chevronRight" size={20} color={colors.forest} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((c) => (
            <Pressable
              key={c.date}
              accessibilityRole="button"
              accessibilityLabel={`${c.day} ${monthTitle(ym.year, ym.month).split(' ')[0]}${
                c.events.length > 0 ? `, ${c.events.length} faaliyet` : ''
              }`}
              accessibilityState={{ selected: picked === c.date }}
              testID={c.events.length > 0 ? 'gun-isaretli' : 'gun'}
              onPress={() => setPicked(c.date)}
              style={[
                styles.cell,
                c.isToday && styles.today,
                picked === c.date && styles.picked,
                !c.inMonth && { opacity: 0.4 },
              ]}
            >
              <Text style={[styles.day, picked === c.date && { color: '#FFFFFF' }]}>{c.day}</Text>
              <View style={styles.dots}>
                {c.events.length > 0 ? (
                  <View style={[styles.dot, picked === c.date && { backgroundColor: '#FFFFFF' }]} />
                ) : null}
                {notGunleri.has(c.date) ? <View style={[styles.dot, styles.notDot]} /> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ))}
      {picked ? (
        <View style={styles.dayList} testID="gun-isleri">
          {day.length === 0 && !notlar.some((n) => n.tarih === picked) ? (
            <Text style={styles.small}>{t.dayEmpty}</Text>
          ) : (
            day.map((e) => (
              <Text key={`${e.templateId}-${e.start}`} style={styles.dayItem}>
                {e.title} ({rangeText(e)})
              </Text>
            ))
          )}
          {notlar
            .filter((n) => n.tarih === picked)
            .map((n) => (
              <View key={n.id} style={styles.notSatir} testID="takvim-notu">
                <Text style={styles.notYazi}>{`Notum: ${n.metin}`}</Text>
                {notSil ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Notu sil"
                    onPress={() => notSil(n.id)}
                  >
                    <Text style={styles.notSil}>Sil</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          {notEkle ? (
            yaziyor ? (
              <View style={styles.notForm}>
                <TextInput
                  value={notMetni}
                  onChangeText={setNotMetni}
                  placeholder="Örn. Zeytin hasadına başla"
                  placeholderTextColor={colors.textMuted}
                  style={styles.notGiris}
                  maxLength={300}
                  autoFocus
                  testID="not-metni"
                />
                <Pressable
                  accessibilityRole="button"
                  testID="not-kaydet"
                  onPress={() => {
                    if (notMetni.trim()) notEkle(picked, notMetni);
                    setNotMetni('');
                    setYaziyor(false);
                  }}
                  style={styles.notKaydet}
                >
                  <Text style={styles.notKaydetYazi}>Kaydet</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                testID="not-al"
                onPress={() => setYaziyor(true)}
                style={styles.notAl}
              >
                <Text style={styles.notAlYazi}>+ Bu güne not al</Text>
              </Pressable>
            )
          ) : null}
          {notEkle ? (
            <Text style={styles.small}>
              Not aldığın işin 2 gün ve 1 gün öncesinde, bir de o gün sabah 09:00'da telefonuna
              bildirim gelir.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: fontSize.title, color: colors.forest },
  row: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    paddingVertical: 4,
  },
  cell: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  today: { borderWidth: 1, borderColor: homeColors.tabSelected },
  picked: { backgroundColor: homeColors.tabSelected },
  day: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: homeColors.tabSelected,
    marginTop: 1,
  },
  dayList: { paddingTop: spacing.md, gap: 6 },
  dots: { flexDirection: 'row', gap: 3 },
  notDot: { backgroundColor: '#E0A21A' },
  notSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF6E0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  notYazi: { flex: 1, fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: '#6B4A00' },
  notSil: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: '#B23A2B' },
  notAl: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.forest,
    borderRadius: 99,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  notAlYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  notForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  notGiris: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: '#14302D',
  },
  notKaydet: {
    backgroundColor: colors.forest,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  notKaydetYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: '#FFFFFF' },
  dayItem: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
