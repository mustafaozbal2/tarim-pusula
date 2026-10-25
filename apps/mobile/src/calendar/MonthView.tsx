import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, fontSize, homeColors, spacing } from '@tarim/ui';
import type { CalendarEventDto } from '../api/client';
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
}: {
  events: readonly CalendarEventDto[];
  today: string;
}) {
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
              {c.events.length > 0 ? (
                <View style={[styles.dot, picked === c.date && { backgroundColor: '#FFFFFF' }]} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ))}
      {picked ? (
        <View style={styles.dayList} testID="gun-isleri">
          {day.length === 0 ? (
            <Text style={styles.small}>{t.dayEmpty}</Text>
          ) : (
            day.map((e) => (
              <Text key={`${e.templateId}-${e.start}`} style={styles.dayItem}>
                {e.title} ({rangeText(e)})
              </Text>
            ))
          )}
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
  dayList: { paddingTop: spacing.md, gap: 2 },
  dayItem: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
