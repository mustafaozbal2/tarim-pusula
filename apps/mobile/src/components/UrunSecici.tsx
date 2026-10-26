import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, elevation, fontFamily, fontSize, homeColors, radius } from '@tarim/ui';
import type { CropDto } from '../api/client';
import { tr } from '../i18n/tr';
import { api } from '../session';
import { CROP_GROUPS, groupCrops } from '../fields/cropGroups';
import { Icon, type IconName } from './Icon';

/**
 * Ürün seçici: en çok ekilenler üstte büyük düğme; altında arama ve bütün ürünler gruplu (meyve, sebze,
 * tahıl...). Ürün listede yoksa çiftçi aramayla bulur; 45 ürünün hepsi seçilebilir (G23.10).
 */
export function UrunSecici({
  value,
  onChange,
  testID = 'urun-secici',
}: {
  value: string | null;
  onChange: (id: string, name: string) => void;
  testID?: string;
}) {
  const [crops, setCrops] = useState<CropDto[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    api.crops().then(setCrops, () => setCrops(null));
  }, []);
  const common = useMemo(
    () =>
      crops
        ? crops
            .filter((c) => c.commonRank !== null)
            .sort((a, b) => (a.commonRank ?? 99) - (b.commonRank ?? 99))
            .map((c) => ({ id: c.id, name: c.nameTr }))
        : [...tr.commonCrops],
    [crops],
  );
  const groups = useMemo(() => (crops ? groupCrops(crops, query) : []), [crops, query]);

  const chip = (id: string, name: string, color: string, icon: IconName, all = false) => {
    const on = value === id;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={name}
        testID={all ? `urun-tum-${id}` : `urun-${id}`}
        onPress={() => onChange(id, name)}
        style={[styles.chip, on && styles.chipOn]}
      >
        <View style={[styles.dot, { backgroundColor: on ? '#FFFFFF' : `${color}22` }]}>
          <Icon name={icon} size={16} color={color} />
        </View>
        <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={2}>
          {name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.head}>{tr.cropPicker.common}</Text>
      <View style={styles.grid}>
        {common.map((c) => chip(c.id, c.name, homeColors.tabSelected, 'leaf'))}
      </View>
      <Text style={styles.head}>{tr.cropPicker.all}</Text>
      <View style={styles.search}>
        <Icon name="target" size={18} color={colors.textMuted} />
        <TextInput
          accessibilityLabel={tr.cropPicker.search}
          testID="urun-ara"
          value={query}
          onChangeText={setQuery}
          placeholder={tr.cropPicker.search}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>
      {crops === null ? <Text style={styles.note}>{tr.cropPicker.offline}</Text> : null}
      {crops && groups.length === 0 ? <Text style={styles.note}>{tr.cropPicker.none}</Text> : null}
      {groups.map((g) => {
        const meta = CROP_GROUPS[g.group] ?? { label: g.group, icon: 'leaf', color: colors.forest };
        return (
          <View key={g.group} style={styles.group}>
            <Text style={[styles.groupTitle, { color: meta.color }]}>{meta.label}</Text>
            <View style={styles.grid}>
              {g.items.map((c) => chip(c.id, c.nameTr, meta.color, meta.icon as IconName, true))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  head: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '48.6%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  chipOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  dot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  chipText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, color: colors.forest },
  chipTextOn: { color: '#FFFFFF' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.body,
    color: colors.forest,
  },
  group: { gap: 6 },
  groupTitle: { fontFamily: fontFamily.extrabold, fontSize: 14 },
  note: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
