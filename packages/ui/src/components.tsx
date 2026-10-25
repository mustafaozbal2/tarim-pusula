import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  buttonStyle,
  cardStyle,
  chipStyle,
  DRAFT_BADGE_TEXT,
  formatDateBox,
  tabloSuz,
  type ButtonVariant,
  type TabloSatiri,
  type TabloSutunu,
} from './styles';
export { tabloSuz, type TabloSatiri, type TabloSutunu } from './styles';
import { colors, elevation, fontFamily, fontSize, radius, ROW_HEIGHT, spacing } from './tokens';

export function Button(props: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const s = buttonStyle(props.variant);
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[
        styles.button,
        { minHeight: s.minHeight, backgroundColor: s.backgroundColor, borderColor: s.borderColor },
        props.style,
      ]}
    >
      <Text style={[styles.buttonText, { color: s.textColor }]}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={props.testID} style={[styles.card, props.style]}>
      {props.children}
    </View>
  );
}

export function Chip(props: { label: string; selected?: boolean; onPress?: () => void }) {
  const s = chipStyle(props.selected ? 'selected' : 'idle');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.selected }}
      onPress={props.onPress}
      style={[
        styles.chip,
        { minHeight: s.minHeight, backgroundColor: s.backgroundColor, borderColor: s.borderColor },
      ]}
    >
      <Text style={[styles.chipText, { color: s.textColor }]}>{props.label}</Text>
    </Pressable>
  );
}

/** Onay rozeti (değişmez kural 1). Renk tek başına anlam taşımaz: yazı her zaman var. */
export function Rozet(props: { label?: string; tone?: 'draft' | 'approved' }) {
  const approved = props.tone === 'approved';
  return (
    <View style={[styles.badge, approved && styles.badgeOk]}>
      <Text style={[styles.badgeText, approved && { color: colors.forest }]}>
        {props.label ?? (approved ? 'Uzman onaylı' : DRAFT_BADGE_TEXT)}
      </Text>
    </View>
  );
}
export const Badge = Rozet;

/** Seçim satırı: başlık + isteğe bağlı açıklama (sıkı, 44+ px). */
export function BigChoice(props: {
  title: string;
  hint?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!props.selected }}
      onPress={props.onPress}
      style={[
        styles.choice,
        props.selected && { backgroundColor: colors.pistachio, borderColor: colors.forest },
      ]}
    >
      <Text style={styles.choiceTitle}>{props.title}</Text>
      {props.hint ? <Text style={styles.choiceHint}>{props.hint}</Text> : null}
    </Pressable>
  );
}

/** Duyurular | Bildirimler gibi sekmeli anahtar; seçili sekme koyu yeşil dolgu. */
export function SekmeAnahtari<T extends string>(props: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  testID?: string;
}) {
  return (
    <View style={styles.segment} testID={props.testID}>
      {props.options.map((o) => {
        const on = o.key === props.value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => props.onChange(o.key)}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && { color: colors.onForest }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Solda tarih kutusu (koyu yeşil), sağda yeşil başlık şeridi. */
export function TarihBasliSatir(props: {
  date: string;
  title: string;
  tone?: 'normal' | 'warning';
  /** Başlığın altında küçük onay rozeti yazısı (ör. "Uzman onayı bekliyor"). */
  badge?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const warn = props.tone === 'warning';
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={`${formatDateBox(props.date)} ${props.title}${props.badge ? `. ${props.badge}` : ''}`}
      onPress={props.onPress}
      style={styles.dateRow}
    >
      <View style={styles.dateBox}>
        <Text style={styles.dateText}>{formatDateBox(props.date)}</Text>
      </View>
      <View style={[styles.titleBar, warn && { backgroundColor: colors.amberText }]}>
        <Text style={styles.titleText} numberOfLines={2}>
          {props.title}
        </Text>
        {props.badge ? <Text style={styles.badgeLine}>{props.badge}</Text> : null}
      </View>
    </Pressable>
  );
}

export interface HizliErisimOgesi {
  key: string;
  label: string;
  icon: ReactNode;
  onPress: () => void;
}

/** Hızlı erişim şeridi: etiketli daire simgeler (Arazi, Üretim planı, Takvim, ...). */
export function HizliErisimSeridi(props: { items: HizliErisimOgesi[]; testID?: string }) {
  return (
    <View style={styles.quick} testID={props.testID}>
      {props.items.map((i) => (
        <Pressable
          key={i.key}
          accessibilityRole="button"
          accessibilityLabel={i.label}
          onPress={i.onPress}
          style={styles.quickItem}
        >
          <View style={styles.quickCircle}>{i.icon}</View>
          <Text style={styles.quickLabel} numberOfLines={2}>
            {i.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Etiketli sıkı form alanı. */
export function FormAlani(props: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        testID={props.testID}
        accessibilityLabel={props.label}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType}
        placeholderTextColor={colors.textMuted}
        style={styles.fieldInput}
      />
    </View>
  );
}

/** Arama kutulu sade tablo. İsteğe bağlı Düzenle/Sil eylemleri. */
export function Tablo(props: {
  columns: TabloSutunu[];
  rows: TabloSatiri[];
  query: string;
  onQuery: (q: string) => void;
  searchLabel: string;
  empty: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  testID?: string;
}) {
  const rows = tabloSuz(props.rows, props.columns, props.query);
  const hasActions = !!(props.onEdit || props.onDelete);
  return (
    <View testID={props.testID} style={{ gap: spacing.md }}>
      <TextInput
        accessibilityLabel={props.searchLabel}
        placeholder={props.searchLabel}
        placeholderTextColor={colors.textMuted}
        value={props.query}
        onChangeText={props.onQuery}
        style={styles.search}
      />
      <View style={styles.table}>
        <View style={styles.tableHead}>
          {props.columns.map((c) => (
            <Text key={c.key} style={[styles.th, { flex: c.flex ?? 1 }]}>
              {c.title}
            </Text>
          ))}
          {hasActions ? <Text style={[styles.th, { flex: 1.2 }]} /> : null}
        </View>
        {rows.length === 0 ? <Text style={styles.empty}>{props.empty}</Text> : null}
        {rows.map((r, i) => (
          <View key={r.id} style={[styles.tr, i % 2 === 1 && { backgroundColor: colors.card }]}>
            {props.columns.map((c) => (
              <Text key={c.key} style={[styles.td, { flex: c.flex ?? 1 }]}>
                {r[c.key] ?? '-'}
              </Text>
            ))}
            {hasActions ? (
              <View style={styles.actions}>
                {props.onEdit ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Düzenle ${r.id}`}
                    onPress={() => props.onEdit?.(r.id)}
                    style={styles.act}
                  >
                    <Text style={styles.actText}>Düzenle</Text>
                  </Pressable>
                ) : null}
                {props.onDelete ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Sil ${r.id}`}
                    onPress={() => props.onDelete?.(r.id)}
                    style={styles.act}
                  >
                    <Text style={[styles.actText, { color: colors.brick }]}>Sil</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Boş / yükleniyor / hata durumları: çerçeveli bilgi kutusu, isteğe bağlı eylem. */
export function Durum(props: {
  kind: 'bos' | 'yukleniyor' | 'hata';
  text: string;
  action?: { label: string; onPress: () => void };
  testID?: string;
}) {
  const bad = props.kind === 'hata';
  return (
    <View
      testID={props.testID}
      accessibilityRole={bad ? 'alert' : undefined}
      style={[
        styles.state,
        bad && { backgroundColor: colors.brickSoft, borderColor: colors.brick },
      ]}
    >
      <Text style={[styles.stateText, bad && { color: colors.brick }]}>{props.text}</Text>
      {props.action ? <Button label={props.action.label} onPress={props.action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    ...elevation.card,
  },
  buttonText: { fontFamily: fontFamily.bold, fontSize: fontSize.body },
  card: { ...cardStyle, borderWidth: 1 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  chipText: { fontFamily: fontFamily.bold, fontSize: fontSize.small },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.amberSoft,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: radius.row,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  badgeOk: { backgroundColor: colors.pistachio, borderColor: colors.listGreen },
  badgeText: { fontFamily: fontFamily.bold, fontSize: fontSize.caption, color: colors.amberText },
  choice: {
    minHeight: 48,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  choiceTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.row, color: colors.forest },
  choiceHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.forest },
  segmentText: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.textMuted },
  dateRow: {
    flexDirection: 'row',
    minHeight: ROW_HEIGHT,
    borderRadius: radius.row,
    overflow: 'hidden',
  },
  dateBox: {
    width: 92,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.surface,
  },
  dateText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.onForest },
  titleBar: {
    flex: 1,
    backgroundColor: colors.listGreen,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  titleText: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.row,
    color: colors.onForest,
    textAlign: 'center',
  },
  badgeLine: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.caption,
    color: colors.onForest,
    textAlign: 'center',
    opacity: 0.95,
  },
  quick: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  quickItem: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  quickCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.pistachio,
    borderWidth: 1,
    borderColor: colors.listGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.caption,
    color: colors.forest,
    textAlign: 'center',
  },
  field: { gap: 3 },
  fieldLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  fieldInput: {
    minHeight: 44,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.forest,
  },
  search: {
    minHeight: 44,
    borderRadius: radius.row,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.body,
    color: colors.forest,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.row,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.forest,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  th: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.onForest },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  td: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.forest },
  actions: { flex: 1.2, flexDirection: 'row', gap: spacing.md, justifyContent: 'flex-end' },
  act: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  actText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.listGreen },
  empty: { padding: spacing.xl, fontFamily: fontFamily.medium, fontSize: fontSize.small },
  state: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateText: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
});
