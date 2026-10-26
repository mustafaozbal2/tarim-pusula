import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, colors, FormAlani, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import type { SavingsDto, SoilRowDto } from '../src/api/client';
import { Bolum, SayfaGorseli } from '../src/components/Gorsel';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { tr } from '../src/i18n/tr';
import { withDeadline } from '../src/load/deadline';
import { kv } from '../src/offline/kvStore';
import { savingsQuery } from '../src/savings/query';
import { savingsView } from '../src/savings/report';
import { api } from '../src/session';
import { SELECTED } from '../src/today/load';

const t = tr.savings;
const PERIODS = [30, 60, 90] as const;

/**
 * Tasarruf ve verim raporu (G23.2): geleneksel sulama ile Tarım Pusula'nın FAO-56 su dengesine göre
 * önerdiği sulamanın karşılaştırması. Hesap sunucuda (agro-core savings.ts); ekran yalnız gösterir.
 */
export default function SavingsScreen() {
  const params = useLocalSearchParams<{ fieldId?: string }>();
  const [soils, setSoils] = useState<SoilRowDto[]>([]);
  const [soil, setSoil] = useState('tinli');
  const [days, setDays] = useState<number>(30);
  const [interval, setIntervalDays] = useState('');
  const [depth, setDepth] = useState('');
  const [dto, setDto] = useState<SavingsDto | null | 'error'>(null);

  useEffect(() => {
    void api.soils().then(setSoils, () => setSoils([]));
  }, []);

  const load = useCallback(async () => {
    setDto(null);
    try {
      const id = params.fieldId ?? (await kv.get(SELECTED)) ?? (await api.fields())[0]?.id;
      if (!id) return setDto('error');
      const q = savingsQuery({ days, soil, intervalDays: interval, depthMm: depth });
      setDto(await withDeadline(api.savings(id, q)));
    } catch {
      setDto('error');
    }
  }, [params.fieldId, days, soil, interval, depth]);
  useEffect(() => {
    void load();
  }, [load]);

  const view = dto && dto !== 'error' ? savingsView(dto) : null;
  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_hizmet.jpg" text={t.hero} />

      <Bolum title={t.period}>
        <View style={styles.chips}>
          {PERIODS.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected: d === days }}
              accessibilityLabel={`${d} ${t.days}`}
              testID={`tasarruf-donem-${d}`}
              onPress={() => setDays(d)}
              style={[styles.chip, d === days && styles.chipOn]}
            >
              <Text style={[styles.chipText, d === days && styles.chipTextOn]}>
                {d} {t.days}
              </Text>
            </Pressable>
          ))}
        </View>
      </Bolum>

      {soils.length > 0 ? (
        <Bolum title={t.soil}>
          <View style={styles.chips}>
            {soils.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityState={{ selected: s.key === soil }}
                accessibilityLabel={s.nameTr}
                onPress={() => setSoil(s.key)}
                style={[styles.chip, s.key === soil && styles.chipOn]}
              >
                <Text style={[styles.chipText, s.key === soil && styles.chipTextOn]}>
                  {s.nameTr}
                </Text>
              </Pressable>
            ))}
          </View>
        </Bolum>
      ) : null}

      <Bolum title={t.mine}>
        <Card style={styles.form}>
          <Text style={styles.note}>{t.mineHint}</Text>
          <FormAlani
            label={t.interval}
            value={interval}
            onChangeText={setIntervalDays}
            keyboardType="numeric"
          />
          <FormAlani label={t.depth} value={depth} onChangeText={setDepth} keyboardType="numeric" />
        </Card>
      </Bolum>

      {dto === null ? <Iskelet rows={2} /> : null}
      {dto === 'error' ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {view?.kind === 'none' ? (
        <Card testID="tasarruf-yok">
          <Text style={styles.body}>{view.message}</Text>
        </Card>
      ) : null}
      {view?.kind === 'report' ? (
        <>
          <View style={styles.headline} testID="tasarruf-sonuc">
            <Text style={styles.headlineLabel}>{t.result}</Text>
            <Text style={styles.headlineValue}>{view.headline}</Text>
          </View>
          <Card style={styles.rows}>
            {view.rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
            ))}
          </Card>
          {view.estimateNote ? <Text style={styles.note}>{view.estimateNote}</Text> : null}
          {view.stressNote ? <Text style={styles.warn}>{view.stressNote}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  chipTextOn: { color: '#FFFFFF' },
  form: { gap: 10 },
  headline: {
    backgroundColor: homeColors.band,
    borderRadius: radius.card,
    padding: 16,
    gap: 4,
  },
  headlineLabel: { fontFamily: fontFamily.bold, fontSize: 14, color: homeColors.text },
  headlineValue: { fontFamily: fontFamily.extrabold, fontSize: 24, color: homeColors.text },
  rows: { gap: 10 },
  row: { gap: 2 },
  rowLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  rowValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize.body, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  note: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  warn: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.amberText },
});
