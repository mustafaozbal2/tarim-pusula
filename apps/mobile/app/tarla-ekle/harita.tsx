import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, colors, fontFamily, fontSize } from '@tarim/ui';
import FieldMap from '../../src/components/FieldMap';
import { FlowHeader } from '../../src/components/FlowParts';
import { movedOnMap } from '../../src/flow/draft';
import { updateDraft, useDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { clampZoom, TURKEY_CENTER, zoomFor } from '../../src/location/mapStyle';

const t = tr.flow;

/** Haritada göster / "Burası mı?" onayı. Dokunulan yere işaret konur; Evet → ürün seçimi. */
export default function MapScreen() {
  const router = useRouter();
  const draft = useDraft();
  // Açılış merkezi ekran açıldığında sabitlenir; işaret taşımak haritayı kaydırmaz.
  const start = useRef(
    draft.lat !== null && draft.lon !== null ? { lat: draft.lat, lon: draft.lon } : TURKEY_CENTER,
  ).current;
  const [zoom, setZoom] = useState(draft.lat !== null ? zoomFor(draft.source) : TURKEY_CENTER.zoom);
  const marker =
    draft.lat !== null && draft.lon !== null ? { lat: draft.lat, lon: draft.lon } : null;

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <FieldMap
          testID="harita"
          center={start}
          zoom={zoom}
          marker={marker}
          onZoom={(z) => setZoom(clampZoom(z))}
          onPick={(p) => updateDraft((d) => movedOnMap(d, p))}
        />
      </View>

      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.backWrap}>
          <FlowHeader />
        </View>
      </View>

      <View style={styles.zoom} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.zoomIn}
          testID="yakinlas"
          style={styles.zoomBtn}
          onPress={() => setZoom((z) => clampZoom(z + 1))}
        >
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.zoomOut}
          testID="uzaklas"
          style={styles.zoomBtn}
          onPress={() => setZoom((z) => clampZoom(z - 1))}
        >
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sheetKicker}>{t.mapTitle}</Text>
        <Text style={styles.sheetTitle} testID="harita-yer">
          {draft.village ? `${draft.village} ${t.mapNearPlace}` : t.mapPickedPoint}
        </Text>
        <Text style={styles.sheetHint}>{marker ? t.mapHint : t.mapEmpty}</Text>
        <View style={styles.row}>
          <Button
            variant="secondary"
            label={t.mapNo}
            style={{ flex: 1 }}
            onPress={() => updateDraft((d) => ({ ...d, lat: null, lon: null }))}
          />
          <Button
            label={t.mapYes}
            style={[{ flex: 1 }, !marker && { opacity: 0.45 }]}
            onPress={marker ? () => router.push('/tarla-ekle/urun') : undefined}
          />
        </View>
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: '#14392B',
  shadowOpacity: 0.2,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', left: 12, right: 12, top: 0 },
  backWrap: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 10,
    ...shadow,
  },
  zoom: { position: 'absolute', right: 16, top: 200, gap: 10 },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  zoomText: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.forest },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 28,
    ...shadow,
  },
  sheetKicker: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.textMuted },
  sheetTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: 18,
    color: colors.forest,
    marginTop: 2,
  },
  sheetHint: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: 4,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
