import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  Card,
  colors,
  elevation,
  fontFamily,
  fontSize,
  homeColors,
  radius,
  Rozet,
} from '@tarim/ui';
import type { CropDto, FieldDto } from '../src/api/client';
import { IMAGE_FILES } from '../src/assets';
import { Bolum, IkonKart, KartIzgara, SayfaGorseli } from '../src/components/Gorsel';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { CROP_GROUPS } from '../src/fields/cropGroups';
import { placeLine } from '../src/home/model';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';
import { perDecare, regionOf, REGIONS, WHEAT_YIELD } from '../src/yield/regions';

const t = tr.yieldMap;

/**
 * Verim Haritası (G23.11): bölgede öne çıkan ürünler (genel bilgi, örnek veri etiketli), kaynaklı verim
 * karşılaştırması (TÜİK 2022) ve AFAE örnek bahçe sonucu. Çiftçiye öneri değil bilgi verir; il bazında
 * verim rakamı uydurulmaz (TÜİK il verisi bağlanınca gelir). Drone/ölçüm verisi gelince harita da eklenir.
 */
export default function YieldMapScreen() {
  const router = useRouter();
  const [field, setField] = useState<FieldDto | null>(null);
  const [crops, setCrops] = useState<Record<string, CropDto>>({});

  useEffect(() => {
    void (async () => {
      const raw = await kv.get(FIELDS_CACHE);
      const list = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
      const sel = await kv.get(SELECTED);
      setField(list.find((f) => f.id === sel) ?? list[0] ?? null);
    })();
    api.crops().then(
      (list) => setCrops(Object.fromEntries(list.map((c) => [c.id, c]))),
      () => undefined,
    );
  }, []);

  const region = regionOf(field?.province);
  const info = region ? REGIONS[region] : null;
  const max = Math.max(...WHEAT_YIELD.rows.map((r) => r.kgPerHa));

  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_tarla.jpg" text={t.hero} />

      <Bolum title={info ? `${t.region}: ${info.name}` : t.regionUnknown}>
        {field ? (
          <Text style={styles.muted}>
            {field.name}
            {placeLine(field) ? ` · ${placeLine(field)}` : ''}
          </Text>
        ) : null}
        {info ? (
          <>
            <KartIzgara testID="verim-bolge-urunleri">
              {info.crops.map((id, i) => {
                const c = crops[id];
                const g = CROP_GROUPS[c?.group ?? ''] ?? { color: colors.forest, label: '' };
                const mine = field?.cropId === id;
                return (
                  <View key={id} style={[styles.crop, mine && styles.cropMine]}>
                    <View style={[styles.rank, { backgroundColor: g.color }]}>
                      <Text style={styles.rankText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.cropName}>{c?.nameTr ?? id}</Text>
                    <Text style={styles.cropGroup}>{mine ? t.yours : g.label}</Text>
                  </View>
                );
              })}
            </KartIzgara>
            <View style={styles.badgeRow}>
              <Rozet label={tr.common.sampleData} />
            </View>
            <Text style={styles.muted}>{t.regionNote}</Text>
          </>
        ) : (
          <Text style={styles.muted}>{t.regionMissing}</Text>
        )}
      </Bolum>

      <Bolum title={t.wheatTitle}>
        <Card style={styles.chart} testID="verim-bugday">
          {WHEAT_YIELD.rows.map((r) => (
            <View key={r.label} style={styles.barRow}>
              <Text style={styles.barLabel}>{r.label}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { width: `${(r.kgPerHa / max) * 100}%` },
                    r.label === 'Türkiye' && styles.barTr,
                  ]}
                />
              </View>
              <Text style={styles.barValue}>
                {Math.round(perDecare(r.kgPerHa)).toLocaleString('tr-TR')} kg/da
              </Text>
            </View>
          ))}
          <Text style={styles.muted}>{t.wheatNote}</Text>
          <Text style={styles.source}>
            {tr.common.source}: {WHEAT_YIELD.source}
          </Text>
        </Card>
      </Bolum>

      <Bolum title={t.afaeTitle}>
        <Card style={styles.afae}>
          <Image
            source={IMAGE_FILES['genis_fistik.jpg'] as number}
            style={styles.afaeImage}
            resizeMode="cover"
          />
          <View style={styles.afaeRow}>
            <Icon name="arrowUp" size={26} color={homeColors.tabSelected} />
            <Text style={styles.afaeBig}>{t.afaeBig}</Text>
          </View>
          <Text style={styles.body}>{t.afaeText}</Text>
          <Text style={styles.source}>
            {tr.common.source}: {t.afaeSource}
          </Text>
        </Card>
      </Bolum>

      <Bolum title={t.more}>
        <KartIzgara>
          <IkonKart
            image="ikon_verim_haritasi.png"
            title={tr.ndvi.open}
            hint={t.ndviHint}
            onPress={() => router.push('/ndvi')}
          />
          <IkonKart
            image="ikon_cihaz.png"
            title={t.addDevice}
            hint={t.deviceHint}
            onPress={() => router.push('/cihaz-ekle')}
          />
        </KartIzgara>
        <Text style={styles.muted} testID="verim-bekleniyor">
          {t.waiting}
        </Text>
      </Bolum>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  source: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  crop: {
    width: '31.5%',
    alignItems: 'center',
    gap: 4,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  cropMine: { borderColor: homeColors.band, borderWidth: 2 },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: '#FFFFFF' },
  cropName: {
    fontFamily: fontFamily.extrabold,
    fontSize: 13,
    color: colors.forest,
    textAlign: 'center',
  },
  cropGroup: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted },
  badgeRow: { flexDirection: 'row' },
  chart: { gap: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 92, fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest },
  barTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: colors.card },
  bar: { height: 14, borderRadius: 7, backgroundColor: homeColors.band },
  barTr: { backgroundColor: '#E0702F' },
  barValue: { width: 70, fontFamily: fontFamily.bold, fontSize: 12, color: colors.forest },
  afae: { gap: 8, overflow: 'hidden' },
  afaeImage: { width: '100%', height: 150, borderRadius: radius.row },
  afaeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  afaeBig: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
});
