import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { colors, fontFamily, fontSize, spacing } from '@tarim/ui';
import { Icon } from './Icon';

/**
 * Özgün çiftçi çizimi (eski uygulamadaki karakterin kopyası değil, aynı tarzda yeniden çizildi):
 * hasır şapkalı, sebze sepetli, sarı çizmeli, küreğe yaslanan çiftçi.
 */
export function CiftciKarakteri({ height = 92 }: { height?: number }) {
  const width = (height * 90) / 130;
  return (
    <View accessibilityRole="image" accessibilityLabel="Çiftçi çizimi">
      <Svg width={width} height={height} viewBox="0 0 90 130">
        {/* Kürek */}
        <Rect x={14} y={42} width={3} height={70} rx={1.5} fill="#7A5A3A" />
        <Path d="M9 108h13l-2 10H11z" fill="#8A97A0" />
        {/* Çizmeler */}
        <Path d="M30 100h14v20H26v-6c0-6 2-10 4-14z" fill="#F2C14E" />
        <Path d="M48 100h14v20H44v-6c0-6 2-10 4-14z" fill="#E0AE35" />
        <Rect x={24} y={118} width={22} height={5} rx={2} fill="#5A3D00" />
        <Rect x={44} y={118} width={22} height={5} rx={2} fill="#5A3D00" />
        {/* Pantolon */}
        <Path d="M30 70h32l2 34H48l-2-20-2 20H28z" fill="#8C8A6A" />
        {/* Gövde ve önlük */}
        <Path d="M28 42h36l4 32H26z" fill="#F1ECDC" />
        <Path d="M34 48h24l2 26H32z" fill="#D9CFAE" />
        {/* Kol (küreğe uzanan) */}
        <Path d="M30 46l-12 8 2 6 14-8z" fill="#F1ECDC" />
        <Circle cx={18} cy={58} r={4} fill="#E8B993" />
        {/* Sepet ve sebzeler */}
        <Path d="M52 52h22l-3 18H55z" fill="#B7824A" />
        <Path d="M54 52c1-8 4-12 9-12s8 4 9 12z" fill="#4C9A3E" />
        <Circle cx={60} cy={48} r={4} fill="#D8402F" />
        <Ellipse cx={68} cy={46} rx={3} ry={5} fill="#E8892B" />
        <Path d="M54 52l20 0" stroke="#7A5A3A" strokeWidth={1.5} />
        {/* Baş */}
        <G>
          <Circle cx={46} cy={28} r={11} fill="#E8B993" />
          <Circle cx={42} cy={28} r={1.3} fill="#3A2A1A" />
          <Circle cx={50} cy={28} r={1.3} fill="#3A2A1A" />
          <Path d="M42 33q4 3 8 0" stroke="#8A4B2A" strokeWidth={1.4} fill="none" />
        </G>
        {/* Hasır şapka */}
        <Ellipse cx={46} cy={19} rx={22} ry={5} fill="#D9A441" />
        <Path d="M34 19c0-9 4-13 12-13s12 4 12 13z" fill="#E6B659" />
        <Rect x={34} y={15} width={24} height={3} fill="#8A5A1A" />
      </Svg>
    </View>
  );
}

/** Hava simgesi: güneş + bulut (çizgi/dolgu karışık, emoji değil). */
export function HavaSimgesi({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden>
      <Circle cx={12} cy={12} r={6} fill={colors.amber} />
      <Path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
        stroke={colors.amber}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M14 28h12a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.5A3.8 3.8 0 0 0 14 28z"
        fill="#FFFFFF"
        stroke="#7A8B95"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** Eski uygulamadaki üst alan: solda KONUM + ısı + hava simgesi, sağda çiftçi karakteri. */
export function KonumHavaBasligi(props: {
  location: string;
  temp: string;
  /** Alt satır: hava durumu cümlesi (ör. "Bugün hava açık"). */
  summary?: string;
  /** Seçili tarla adı (küçük satır); dokununca başka tarlaya geçilir. */
  fieldName?: string;
  onSwitchField?: () => void;
  onSettings?: () => void;
  testID?: string;
  tempTestID?: string;
}) {
  return (
    <View style={styles.root} testID={props.testID}>
      <View style={styles.left}>
        <Text
          accessibilityRole="header"
          style={styles.location}
          numberOfLines={1}
          testID="konum-baslik"
        >
          {props.location}
        </Text>
        <View style={styles.tempRow}>
          <Text style={styles.temp} testID={props.tempTestID}>
            {props.temp}
          </Text>
          <HavaSimgesi />
        </View>
        {props.summary ? <Text style={styles.summary}>{props.summary}</Text> : null}
        {props.fieldName ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Başka tarla seç"
            disabled={!props.onSwitchField}
            onPress={props.onSwitchField}
            style={styles.fieldRow}
          >
            <Text style={styles.fieldName} testID="bugun-tarla" numberOfLines={1}>
              {props.fieldName}
            </Text>
            {props.onSwitchField ? (
              <Icon name="chevronDown" size={16} color={colors.forest} />
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <CiftciKarakteri />
      {props.onSettings ? (
        <Pressable
          testID="ayarlar-dugme"
          accessibilityRole="button"
          accessibilityLabel="Ayarlar"
          onPress={props.onSettings}
          style={styles.gear}
        >
          <Icon name="settings" size={22} color={colors.forest} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  left: { flex: 1, paddingBottom: spacing.md, gap: 0 },
  location: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    color: colors.forest,
    letterSpacing: 0.3,
  },
  tempRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  temp: { fontFamily: fontFamily.bold, fontSize: fontSize.title, color: colors.forest },
  gear: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  fieldName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.small,
    color: colors.forest,
    flexShrink: 1,
  },
  summary: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
