import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, radius, spacing } from '@tarim/ui';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { tr } from '../../src/i18n/tr';

const t = tr.today;

export default function TodayScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Icon name="compass" size={22} color={colors.amber} />
        </View>
        <Text style={styles.appName}>{tr.app.name}</Text>
      </View>

      <Card style={styles.fieldRow}>
        <Icon name="pin" />
        <Text style={styles.fieldName}>{t.currentField}</Text>
        <Icon name="chevronDown" size={22} />
      </Card>

      <View style={styles.weather}>
        <View>
          <Text style={styles.temp}>12°</Text>
          <Text style={styles.weatherText}>{t.weather}</Text>
        </View>
        <Icon name="sun" size={64} color={colors.amber} />
      </View>

      <View style={styles.alert}>
        <View style={styles.alertHead}>
          <Icon name="warning" size={22} color={colors.amberText} />
          <Text style={styles.alertLabel}>{t.attention}</Text>
        </View>
        <Text style={styles.alertTitle}>{t.frostTitle}</Text>
        <Text style={styles.alertBody}>{t.frostBody}</Text>
        <Button label={t.frostAction} style={{ marginTop: spacing.lg }} />
        <Text style={styles.alertSource}>{t.frostSource}</Text>
        <Text style={styles.alertSource}>{tr.common.sampleData}</Text>
      </View>

      <Task icon="leaf" label={t.fertilizer} tint={colors.pistachio} />
      <Task icon="drop" label={t.irrigation} tint={colors.waterSoft} />

      <View style={styles.actions}>
        <Button label={t.askByVoice} style={{ flex: 1 }} />
        <Button label={t.takePhoto} variant="secondary" />
      </View>
    </Screen>
  );
}

function Task({ icon, label, tint }: { icon: 'leaf' | 'drop'; label: string; tint: string }) {
  return (
    <View style={styles.task}>
      <View style={[styles.taskIcon, { backgroundColor: tint }]}>
        <Icon name={icon} />
      </View>
      <Text style={styles.taskLabel}>{label}</Text>
      <Icon name="chevronRight" size={22} color={colors.textMuted} />
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
  alert: {
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 2,
    borderRadius: radius.card,
    padding: spacing.xl,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertLabel: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.amberText },
  alertTitle: { fontFamily: fontFamily.extrabold, fontSize: 24, color: '#3B2700', marginTop: 6 },
  alertBody: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.amberText,
    marginTop: 6,
    lineHeight: 24,
  },
  alertSource: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.amberText,
    marginTop: 8,
  },
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
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskLabel: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
});
