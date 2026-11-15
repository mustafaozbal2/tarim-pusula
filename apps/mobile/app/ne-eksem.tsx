import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { Badge, Button, Card, colors, fontFamily, fontSize, radius, spacing } from '@tarim/ui';
import type { FieldDto, NeEksemDto, NeEksemRankedDto } from '../src/api/client';
import { NetworkError } from '../src/api/client';
import { BilgiKarti } from '../src/components/BilgiKarti';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { Bolum, SayfaGorseli } from '../src/components/Gorsel';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { withDeadline } from '../src/load/deadline';
import {
  agacSatiri,
  bantRengi,
  bolgeBasligi,
  dengeCumlesi,
  fiyatSatiri,
  guvenMetni,
  ilkUcPaylari,
  niyetDogrula,
  niyetSatiri,
} from '../src/neeksem/model';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';

const KOYU = '#0E3B37';
const ALTIN = '#F2B84B';
const YESIL = '#5FD394';
const CACHE = (id: string) => `cache.neeksem.v1.${id}`;
const RENK: Record<ReturnType<typeof bantRengi>, string> = {
  yesil: YESIL,
  altin: ALTIN,
  kiremit: colors.brick,
  gri: '#9FB3B1',
};

/** Açık / denge / fazla çubuğu: ortada denge çizgisi; sağa doğru açık (fırsat), sola fazla. */
function DengeCubugu({ r }: { r: Pick<NeEksemRankedDto, 'bar' | 'band'> }) {
  const renk = RENK[bantRengi(r.band)];
  const dolu = Math.round(r.bar * 100);
  return (
    <View style={styles.cubukKap} accessibilityLabel={`Denge çubuğu ${dolu} / 100`}>
      <View style={[styles.cubukDolu, { width: `${dolu}%`, backgroundColor: renk }]} />
      <View style={styles.cubukOrta} />
      <Text style={[styles.cubukYazi, { left: 4 }]}>fazla</Text>
      <Text style={[styles.cubukYazi, { right: 4 }]}>açık</Text>
    </View>
  );
}

/** İlk üçün payı: üç dilimli halka (yüzde). */
function PayHalkasi({ paylar, adlar }: { paylar: number[]; adlar: string[] }) {
  const R = 44;
  const C = 60;
  const renkler = [colors.forest, '#3E9C99', '#9FD3CF'];
  let aci = -90;
  const dilim = (p: number, i: number) => {
    const a0 = (aci * Math.PI) / 180;
    aci += (p / 100) * 360;
    const a1 = (aci * Math.PI) / 180;
    const big = p > 50 ? 1 : 0;
    const d = `M${C + R * Math.cos(a0)},${C + R * Math.sin(a0)} A${R},${R} 0 ${big} 1 ${C + R * Math.cos(a1)},${C + R * Math.sin(a1)}`;
    return (
      <Path
        key={i}
        d={d}
        fill="none"
        stroke={renkler[i] ?? '#ccc'}
        strokeWidth={14}
        strokeLinecap="butt"
      />
    );
  };
  return (
    <View style={styles.halkaSatir}>
      <Svg width={120} height={120} accessibilityLabel="İlk üç ürünün payı">
        {paylar.map(dilim)}
        <SvgText
          x={C}
          y={C + 5}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill={colors.forest}
        >
          ilk 3
        </SvgText>
      </Svg>
      <View style={{ flex: 1, gap: 6 }}>
        {paylar.map((p, i) => (
          <View key={i} style={styles.halkaEtiket}>
            <View style={[styles.nokta, { backgroundColor: renkler[i] }]} />
            <Text style={styles.small}>
              {i + 1}. {adlar[i]} · %{p}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function NeEksemScreen() {
  const params = useLocalSearchParams<{ fieldId?: string }>();
  const router = useRouter();
  const [fields, setFields] = useState<FieldDto[]>([]);
  const [field, setField] = useState<FieldDto | null>(null);
  const [dto, setDto] = useState<NeEksemDto | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'nofield'>('loading');
  const [offline, setOffline] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);
  const [tumu, setTumu] = useState(false);
  const [niyetUrun, setNiyetUrun] = useState<string | null>(null);
  const [niyetDekar, setNiyetDekar] = useState('');
  const [niyetHata, setNiyetHata] = useState<string | null>(null);
  const [niyetMesaj, setNiyetMesaj] = useState<string | null>(null);
  const [neden, setNeden] = useState(false);

  const load = useCallback(
    async (pick?: string) => {
      setState('loading');
      let all: FieldDto[];
      try {
        all = await api.fields();
        await kv.set(FIELDS_CACHE, JSON.stringify({ at: new Date().toISOString(), fields: all }));
      } catch {
        const raw = await kv.get(FIELDS_CACHE);
        all = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
      }
      setFields(all);
      if (all.length === 0) return setState('nofield');
      const id = pick ?? params.fieldId ?? (await kv.get(SELECTED));
      const f = all.find((x) => x.id === id) ?? all[0]!;
      setField(f);
      await kv.set(SELECTED, f.id);
      try {
        const d = await withDeadline(api.neEksem(f.id));
        setDto(d);
        setOffline(false);
        await kv.set(CACHE(f.id), JSON.stringify(d));
        setState('ready');
      } catch (e) {
        const raw = await kv.get(CACHE(f.id));
        if (raw) {
          setDto(JSON.parse(raw) as NeEksemDto);
          setOffline(e instanceof NetworkError || true);
          setState('ready');
        } else setState('error');
      }
    },
    [params.fieldId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const paylar = useMemo(() => (dto ? ilkUcPaylari(dto.ranked) : []), [dto]);

  const beyanEt = async () => {
    if (!field || !niyetUrun) return;
    const v = niyetDogrula(niyetDekar, field.areaDecare);
    if (!v.ok) return setNiyetHata(v.hata);
    try {
      await api.neEksemNiyet(field.id, { cropId: niyetUrun, dekar: v.dekar });
      setNiyetUrun(null);
      setNiyetDekar('');
      setNiyetHata(null);
      setNiyetMesaj('Niyetin kaydedildi. Bölge toplamına kişisiz (yalnız dekar) olarak girer.');
      await load(field.id);
    } catch {
      setNiyetHata('Kayıt gönderilemedi. Bağlantını kontrol et.');
    }
  };
  const niyetSil = async (id: string) => {
    if (!field) return;
    try {
      await api.neEksemNiyetSil(field.id, id);
      await load(field.id);
    } catch {
      setNiyetHata('Silinemedi. Bağlantını kontrol et.');
    }
  };

  const header = <FlowHeader title="Ne Eksem?" />;
  if (state === 'loading') {
    return (
      <FlowScreen>
        {header}
        <Iskelet rows={3} />
      </FlowScreen>
    );
  }
  if (state === 'nofield') {
    return (
      <FlowScreen>
        {header}
        <SayfaGorseli
          image="genis_ciftciler.jpg"
          text="Türkiye neye ihtiyaç duyuyor, bölgen neye uygun: birlikte bakalım."
        />
        <Card style={styles.card} testID="neeksem-tarla-yok">
          <Text style={styles.body}>
            Sıralama tarlanın ilçesine göre yapılır; önce bir arazi ekle.
          </Text>
          <Button label="Arazi ekle" onPress={() => router.push('/tarla-ekle')} />
        </Card>
      </FlowScreen>
    );
  }
  if (state === 'error' || !dto || !field) {
    return (
      <FlowScreen>
        {header}
        <YuklemeHatasi onRetry={() => void load()} />
      </FlowScreen>
    );
  }

  const ilkUc = dto.ranked.slice(0, 3);
  const kalan = dto.ranked.slice(3);
  const birinci = ilkUc[0];
  const kart = (r: NeEksemRankedDto, i: number) => {
    const acikMi = acik === r.cropId;
    const agac = agacSatiri(r);
    const fiyat = fiyatSatiri(r.priceTrend);
    return (
      <Pressable
        key={r.cropId}
        testID={`neeksem-urun-${r.cropId}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: acikMi }}
        onPress={() => setAcik(acikMi ? null : r.cropId)}
        style={[styles.urun, i === 0 && styles.urunBirinci]}
      >
        <View style={styles.rowBetween}>
          <View style={styles.sira}>
            <Text style={styles.siraYazi}>{i + 1}</Text>
          </View>
          <Text style={styles.urunAd} numberOfLines={1}>
            {r.name}
          </Text>
          {r.inDistrictPlan ? (
            <Badge label="Resmî planda" />
          ) : r.inProvincePlan ? (
            <Badge label="İl planında" />
          ) : null}
        </View>
        <Text style={styles.urunDenge}>{dengeCumlesi(r)}</Text>
        <DengeCubugu r={r} />
        <Text style={styles.small}>{niyetSatiri(r)}</Text>
        {fiyat ? <Text style={styles.small}>{fiyat}</Text> : null}
        {agac ? <Text style={[styles.small, styles.agac]}>{agac}</Text> : null}
        {acikMi ? (
          <View style={styles.neden}>
            <Text style={styles.etiket}>Neden bu sırada?</Text>
            {r.reasons.map((s) => (
              <Text key={s} style={styles.small}>
                · {s}
              </Text>
            ))}
            {r.balanceSource ? (
              <Text style={styles.small}>
                Kaynak: {r.balanceSource.source} ({r.balanceSource.period})
              </Text>
            ) : null}
            <Button
              testID={`neeksem-niyet-${r.cropId}`}
              label={r.mine !== null ? 'Niyetimi güncelle' : 'Bu ürün için niyet bildir'}
              variant="secondary"
              onPress={() => {
                setNiyetUrun(r.cropId);
                setNiyetDekar(r.mine !== null ? String(r.mine) : '');
                setNiyetMesaj(null);
              }}
            />
          </View>
        ) : (
          <Text style={styles.ipucu}>Neden? için dokun</Text>
        )}
      </Pressable>
    );
  };
  const seciliAd = dto.ranked.find((r) => r.cropId === niyetUrun)?.name ?? niyetUrun;

  return (
    <FlowScreen>
      {header}
      <SayfaGorseli
        image="genis_ciftciler.jpg"
        focusY={0.4}
        text="Türkiye neye ihtiyaç duyuyor, bölgen neye uygun: birlikte bakalım."
      />

      {/* Tarla seçici */}
      <Text style={styles.etiket}>Hangi tarla için?</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.secRow}
      >
        {fields.map((f) => {
          const aktif = f.id === field.id;
          return (
            <Pressable
              key={f.id}
              testID={`neeksem-tarla-${f.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: aktif }}
              onPress={() => (aktif ? undefined : void load(f.id))}
              style={[styles.sec, aktif && styles.secAktif]}
            >
              <Text style={[styles.secYazi, aktif && styles.secYaziAktif]} numberOfLines={1}>
                {f.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.rowBetween}>
        <Text style={styles.body} testID="neeksem-tarla">
          {field.name}
        </Text>
        {dto.badge ? <Badge label="Bilgi notu · uzman onayı bekliyor" /> : null}
      </View>
      <Text style={styles.small} testID="neeksem-bolge">
        {bolgeBasligi(dto)}
        {field.areaDecare ? ` · ${Math.round(field.areaDecare)} dekar` : ''}
      </Text>
      {offline ? <Notice tone="warn">Sunucuya ulaşılamadı; son hesap gösteriliyor.</Notice> : null}

      {/* Özet kartı */}
      <Card style={[styles.card, styles.koyu]} testID="neeksem-ozet">
        <Text style={styles.koyuUst}>
          {dto.season} SEZONU · GÜVEN: {guvenMetni(dto.confidence).toUpperCase()}
        </Text>
        <Text style={styles.koyuBaslik}>
          {birinci
            ? `Bölgende açığı en yüksek görünen ürün: ${birinci.name}`
            : 'Bu bölge için sıralanacak ürün verisi yok'}
        </Text>
        <Text style={styles.koyuAlt}>
          Bu bir ekim emri değil, bilgi notudur. Tarla, su ve pazar koşullarını sen bilirsin; karar
          senin.
        </Text>
      </Card>

      {/* İlk üç */}
      <Bolum title="Açığı en yüksek görünen 3 ürün">
        {ilkUc.length > 0 ? (
          <Card style={styles.card}>
            <PayHalkasi paylar={paylar} adlar={ilkUc.map((r) => r.name)} />
            <Text style={styles.small}>
              Halka, ilk üçün sıralama puanı payını gösterir; verim ya da kazanç payı değildir.
            </Text>
          </Card>
        ) : null}
        {ilkUc.map(kart)}
      </Bolum>

      {/* Sıralama tablosu */}
      {kalan.length > 0 ? (
        <Bolum title="Sıralamanın devamı">
          <Card style={styles.card} testID="neeksem-tablo">
            {(tumu ? kalan : kalan.slice(0, 3)).map((r, i) => (
              <View key={r.cropId} style={styles.satir}>
                <Text style={styles.satirSira}>{i + 4}.</Text>
                <Text style={styles.satirAd} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.satirBant, { color: RENK[bantRengi(r.band)] }]}>
                  {r.bandLabel ?? ''}
                </Text>
              </View>
            ))}
            {kalan.length > 3 ? (
              <Button
                label={tumu ? 'Daha az göster' : `Hepsini göster (${kalan.length})`}
                variant="secondary"
                onPress={() => setTumu((v) => !v)}
              />
            ) : null}
          </Card>
        </Bolum>
      ) : null}

      {/* Kısıtlı ve verisiz */}
      {dto.restricted.length > 0 ? (
        <Bolum title="Yeni bahçe kısıtlı ürünler">
          <Card style={styles.card} testID="neeksem-kisitli">
            {dto.restricted.map((r) => (
              <Text key={r.cropId} style={styles.small}>
                · {r.name}: {r.bandLabel ?? 'denge verisi yok'}; {r.restricted?.rule}
              </Text>
            ))}
            <Text style={styles.small}>
              Yeterliliği %150'yi aşan meyve türlerinde yeni bahçe tesisi izne bağlıdır (uzman onayı
              bekleyen kural; il müdürlüğüne sor).
            </Text>
          </Card>
        </Bolum>
      ) : null}

      {/* Niyet */}
      <Bolum title="Ekim niyeti">
        <Card style={styles.card} testID="neeksem-niyet-kart">
          <Text style={styles.small}>
            Hangi ürüne kaç dekar ayırmayı düşünüyorsun? Beyanın bağlayıcı değildir; bölge toplamı
            herkese kişisiz gösterilir, böylece herkes aynı ürüne yığılmaz.
          </Text>
          {niyetUrun ? (
            <>
              <Text style={styles.etiket}>{seciliAd} için kaç dekar?</Text>
              <TextInput
                testID="neeksem-niyet-dekar"
                value={niyetDekar}
                onChangeText={setNiyetDekar}
                keyboardType="numeric"
                placeholder={field.areaDecare ? `en çok ${Math.round(field.areaDecare)}` : 'ör. 10'}
                style={styles.giris}
                accessibilityLabel="Dekar"
              />
              {niyetHata ? <Notice tone="warn">{niyetHata}</Notice> : null}
              <Button
                testID="neeksem-niyet-gonder"
                label="Niyetimi bildir"
                onPress={() => void beyanEt()}
              />
              <Button label="Vazgeç" variant="secondary" onPress={() => setNiyetUrun(null)} />
            </>
          ) : (
            <Text style={styles.small}>
              Bir ürünün kartına dokunup "niyet bildir" seçebilirsin.
            </Text>
          )}
          {niyetMesaj ? <Notice tone="info">{niyetMesaj}</Notice> : null}
          {dto.myIntents.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              {dto.myIntents.map((n) => (
                <View key={n.id} style={styles.rowBetween} testID={`neeksem-niyetim-${n.cropId}`}>
                  <Text style={styles.small}>
                    {n.name}: {n.dekar} dekar
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${n.name} niyetini sil`}
                    onPress={() => void niyetSil(n.id)}
                    style={styles.sil}
                  >
                    <Text style={styles.silYazi}>Sil</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Bolum>

      {/* Kaynaklar */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setNeden((v) => !v)}
        style={styles.nedenDugme}
        testID="neeksem-neden"
      >
        <Text style={styles.nedenYazi}>
          {neden ? 'Nedenini gizle' : 'Neden? Nasıl hesaplandı?'}
        </Text>
      </Pressable>
      {neden ? (
        <BilgiKarti
          title="Hesap ve kaynaklar"
          lines={[
            'Açık oranı = 1 − yeterlilik/100 (TÜİK bitkisel ürün denge tabloları). Sıralama puanı = açık + resmî plan + fiyat eğilimi; ağırlıklar uygulamanın seçimidir.',
            ...dto.sources.balance.map((s) => `Denge: ${s}`),
            dto.sources.plan ? `Resmî ürün deseni: ${dto.sources.plan}` : 'Resmî ürün deseni: yok',
            dto.sources.restriction
              ? `Bahçe kısıtı: ${dto.sources.restriction}`
              : 'Bahçe kısıtı: yok',
            `Fiyat: ${dto.sources.prices}`,
            `Güven düzeyi: ${dto.confidenceLabel}`,
            ...dto.assumptions,
            ...(dto.noData.length > 0
              ? [`Denge verisi olmayan ürünler: ${dto.noData.map((n) => n.name).join(', ')}`]
              : []),
            'Yöntem: Olofsson vd. 2014 alan tahmini ve ters varyans birleştirme çekirdekte hazır; uydu sınıflandırma etiketi (ÇKS) bağlanınca "uydu destekli" güvene geçer. packages/agro-core neEksem.ts',
          ]}
        />
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  body: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  small: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.small,
    color: colors.textMuted,
    lineHeight: 18,
  },
  etiket: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  ipucu: { fontFamily: fontFamily.semibold, fontSize: fontSize.caption, color: colors.forest },
  agac: { color: colors.amberText },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  koyu: { backgroundColor: KOYU, borderRadius: radius.card, padding: spacing.lg },
  koyuUst: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: '#9FC9C3',
    letterSpacing: 1,
  },
  koyuBaslik: { fontFamily: fontFamily.extrabold, fontSize: 20, color: '#FFFFFF' },
  koyuAlt: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: '#CFE7E2' },
  urun: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
  },
  urunBirinci: { borderColor: colors.forest, borderWidth: 2 },
  sira: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siraYazi: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: '#FFFFFF' },
  urunAd: { flex: 1, fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.forest },
  urunDenge: { fontFamily: fontFamily.semibold, fontSize: fontSize.small, color: colors.forest },
  cubukKap: {
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E6EFEE',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  cubukDolu: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 11 },
  cubukOrta: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: KOYU,
  },
  cubukYazi: {
    position: 'absolute',
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: KOYU,
  },
  halkaSatir: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  halkaEtiket: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nokta: { width: 12, height: 12, borderRadius: 6 },
  neden: { gap: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  satir: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  satirSira: {
    width: 28,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.small,
    color: colors.forest,
  },
  satirAd: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  satirBant: { fontFamily: fontFamily.bold, fontSize: fontSize.caption },
  secRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  sec: {
    minHeight: 44,
    maxWidth: 200,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.forest,
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  secAktif: { backgroundColor: colors.forest },
  secYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  secYaziAktif: { color: '#FFFFFF' },
  giris: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.body,
    color: colors.forest,
    backgroundColor: colors.surface,
  },
  sil: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  silYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.brick },
  nedenDugme: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.pistachio,
  },
  nedenYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.pistachioText },
});
