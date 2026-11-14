import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Badge, Button, Card, colors, fontFamily, fontSize, radius, spacing } from '@tarim/ui';
import type { FieldDto, SoilRowDto, TwinDto, TwinScenarioDto } from '../src/api/client';
import { NetworkError } from '../src/api/client';
import { BilgiKarti, OzetKarolari } from '../src/components/BilgiKarti';
import { FlowHeader, FlowScreen, Notice } from '../src/components/FlowParts';
import { Bolum, SayfaGorseli } from '../src/components/Gorsel';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import {
  durumKarti,
  grafikSerisi,
  karneMetni,
  kisaTarih,
  mm,
  oneriCumlesi,
  senaryoOzeti,
  siralaSenaryolar,
  yuzde,
  type GrafikNoktasi,
} from '../src/ikiz/model';
import { withDeadline } from '../src/load/deadline';
import { kv } from '../src/offline/kvStore';
import { api } from '../src/session';
import { FIELDS_CACHE, SELECTED } from '../src/today/load';

const KOYU = '#0E3B37';
const ALTIN = '#F2B84B';
const CACHE = (id: string) => `cache.ikiz.v1.${id}`;

/** Zaman çubuğu: kökteki su doluluğu; geçmiş düz çizgi, gelecek kesikli + belirsizlik bandı. */
function ZamanCubugu({ seri, w, today }: { seri: GrafikNoktasi[]; w: number; today: string }) {
  const h = 150;
  const pad = { l: 30, r: 8, t: 12, b: 26 };
  if (seri.length < 2 || w <= 0) return null;
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (seri.length - 1);
  const y = (v: number) => pad.t + (1 - v) * (h - pad.t - pad.b);
  const bugunI = seri.findIndex((p) => !p.gecmis);
  const gecmis = seri.filter((p) => p.gecmis);
  const gelecek = seri.slice(Math.max(0, bugunI - 1));
  const band =
    gelecek.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(seri.indexOf(p))},${y(p.p90)}`).join(' ') +
    ' ' +
    [...gelecek]
      .reverse()
      .map((p) => `L${x(seri.indexOf(p))},${y(p.p10)}`)
      .join(' ') +
    ' Z';
  const etiketler = seri
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i === 0 || i === bugunI || i === seri.length - 1 || i === bugunI + 7);
  return (
    <Svg width={w} height={h} accessibilityLabel="Kökteki su doluluğu zaman çizgisi">
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <Line
          key={v}
          x1={pad.l}
          x2={w - pad.r}
          y1={y(v)}
          y2={y(v)}
          stroke="#D3E6E3"
          strokeWidth={1}
        />
      ))}
      {[0, 0.5, 1].map((v) => (
        <SvgText key={v} x={2} y={y(v) + 4} fill={colors.textMuted} fontSize={10}>
          {`%${v * 100}`}
        </SvgText>
      ))}
      {bugunI > 0 ? (
        <Rect x={x(bugunI) - 0.5} y={pad.t} width={1.5} height={h - pad.t - pad.b} fill={ALTIN} />
      ) : null}
      <Path d={band} fill={colors.water} fillOpacity={0.18} />
      <Polyline
        points={gecmis.map((p, i) => `${x(i)},${y(p.p50)}`).join(' ')}
        fill="none"
        stroke={colors.forest}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <Polyline
        points={gelecek.map((p) => `${x(seri.indexOf(p))},${y(p.p50)}`).join(' ')}
        fill="none"
        stroke={colors.water}
        strokeWidth={2.4}
        strokeDasharray="5 4"
        strokeLinejoin="round"
      />
      {seri.map((p, i) =>
        p.sulama ? (
          <Circle
            key={`s${i}`}
            cx={x(i)}
            cy={y(p.p50)}
            r={4}
            fill={colors.water}
            stroke="#fff"
            strokeWidth={1.5}
          />
        ) : p.yagis ? (
          <Circle key={`y${i}`} cx={x(i)} cy={y(p.p50)} r={3} fill="#7FB3D5" />
        ) : null,
      )}
      {etiketler.map(({ p, i }) => (
        <SvgText
          key={i}
          x={x(i)}
          y={h - 8}
          fill={colors.textMuted}
          fontSize={10}
          textAnchor={i === 0 ? 'start' : i === seri.length - 1 ? 'end' : 'middle'}
        >
          {p.date === today ? 'bugün' : kisaTarih(p.date)}
        </SvgText>
      ))}
    </Svg>
  );
}

function Doluluk({ oran }: { oran: number }) {
  return (
    <View style={styles.dolulukKap} accessibilityLabel={`Kökteki su ${yuzde(oran)} dolu`}>
      <View style={[styles.dolulukDolu, { width: `${Math.round(oran * 100)}%` }]} />
    </View>
  );
}

export default function IkizTarimScreen() {
  const params = useLocalSearchParams<{ fieldId?: string }>();
  const router = useRouter();
  const [fields, setFields] = useState<FieldDto[]>([]);
  const [field, setField] = useState<FieldDto | null>(null);
  const [dto, setDto] = useState<TwinDto | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'nofield'>('loading');
  const [offline, setOffline] = useState(false);
  const [soils, setSoils] = useState<SoilRowDto[]>([]);
  const [soil, setSoil] = useState('tinli');
  const [secili, setSecili] = useState(0);
  const [w, setW] = useState(0);
  const [kayitAcik, setKayitAcik] = useState(false);
  const [kayitMm, setKayitMm] = useState('');
  const [kayitTur, setKayitTur] = useState<'sulama' | 'yagis'>('sulama');
  const [kayitGun, setKayitGun] = useState<'bugun' | 'dun'>('bugun');
  const [kayitHata, setKayitHata] = useState<string | null>(null);
  const [neden, setNeden] = useState(false);

  const load = useCallback(
    async (pick?: string, soilKey = soil) => {
      setState('loading');
      let all: FieldDto[];
      try {
        all = await api.fields();
        await kv.set(FIELDS_CACHE, JSON.stringify({ at: new Date().toISOString(), fields: all }));
      } catch {
        const raw = await kv.get(FIELDS_CACHE);
        all = raw ? (JSON.parse(raw) as { fields: FieldDto[] }).fields : [];
      }
      const konumlu = all.filter((f) => f.lat !== null && f.lon !== null);
      setFields(konumlu);
      if (konumlu.length === 0) return setState('nofield');
      const id = pick ?? params.fieldId ?? (await kv.get(SELECTED));
      const f = konumlu.find((x) => x.id === id) ?? konumlu[0]!;
      setField(f);
      await kv.set(SELECTED, f.id);
      try {
        const d = await withDeadline(api.twin(f.id, `soil=${encodeURIComponent(soilKey)}`));
        setDto(d);
        setOffline(false);
        await kv.set(CACHE(f.id), JSON.stringify(d));
        setState('ready');
      } catch (e) {
        const raw = await kv.get(CACHE(f.id));
        if (raw) {
          setDto(JSON.parse(raw) as TwinDto);
          setOffline(e instanceof NetworkError || true);
          setState('ready');
        } else setState('error');
      }
    },
    [params.fieldId, soil],
  );

  useFocusEffect(
    useCallback(() => {
      void api.soils().then(setSoils, () => setSoils([]));
      void load();
    }, [load]),
  );

  const siralanmis = useMemo(() => (dto ? siralaSenaryolar(dto.scenarios) : []), [dto]);
  const sec: TwinScenarioDto | undefined = siralanmis[secili] ?? siralanmis[0];
  const seri = useMemo(() => (dto && sec ? grafikSerisi(dto, sec) : []), [dto, sec]);

  const kaydet = async () => {
    if (!field) return;
    const v = Number(kayitMm.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0 || v > 500)
      return setKayitHata('0 ile 500 mm arasında bir sayı yaz.');
    const d = new Date(Date.now() + 3 * 3_600_000 - (kayitGun === 'dun' ? 86_400_000 : 0));
    try {
      await api.twinAddEvent(field.id, {
        onDate: d.toISOString().slice(0, 10),
        kind: kayitTur,
        mm: v,
      });
      setKayitAcik(false);
      setKayitMm('');
      setKayitHata(null);
      await load(field.id);
    } catch {
      setKayitHata('Kayıt gönderilemedi. Bağlantını kontrol et.');
    }
  };

  const header = <FlowHeader title="İkiz Tarım" />;
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
          image="genis_tarla.jpg"
          text="Tarlanın dijital ikizi: bugünü gör, yarını dene."
        />
        <Card style={styles.card} testID="ikiz-tarla-yok">
          <Text style={styles.body}>İkiz kurmak için konumu olan bir arazi gerekir.</Text>
          <Button label="Arazi ekle" onPress={() => router.push('/tarla-ekle')} />
        </Card>
      </FlowScreen>
    );
  }
  if (state === 'error' || !dto || !field || !sec) {
    return (
      <FlowScreen>
        {header}
        <YuklemeHatasi onRetry={() => void load()} />
      </FlowScreen>
    );
  }

  const durum = durumKarti(dto);
  const bilgi = dto.mode === 'bilgi';
  const dekar = field.areaDecare;
  return (
    <FlowScreen
      footer={
        fields.length > 1 ? (
          <Button
            label="Başka arazi seç"
            variant="secondary"
            onPress={() => {
              const i = fields.findIndex((f) => f.id === field.id);
              void load(fields[(i + 1) % fields.length]!.id);
            }}
          />
        ) : undefined
      }
    >
      {header}
      <SayfaGorseli
        image="genis_tarla.jpg"
        focusY={0.4}
        text="Tarlanın dijital ikizi: bugünü gör, yarını dene."
      />
      <View style={styles.rowBetween}>
        <Text style={styles.body} testID="ikiz-tarla">
          {field.name}
        </Text>
        {dto.badge ? <Badge label="Bilgi notu · uzman onayı bekliyor" /> : null}
      </View>
      {offline ? <Notice tone="warn">Sunucuya ulaşılamadı; son hesap gösteriliyor.</Notice> : null}
      {dto.weather.sample ? (
        <Notice tone="warn">Hava verisi örnek veridir; gerçek tahmin değildir.</Notice>
      ) : null}

      {/* Bugün */}
      <Card style={[styles.card, styles.koyu]} testID="ikiz-durum">
        <Text style={styles.koyuUst}>BUGÜN · {kisaTarih(dto.today)}</Text>
        <Text style={styles.koyuBaslik}>{durum.baslik}</Text>
        <Text style={styles.koyuAlt}>{durum.altBaslik}</Text>
        <Doluluk oran={durum.doluluk} />
        <Text style={styles.koyuAlt}>{durum.belirsizlik}</Text>
        <Text style={[styles.koyuOneri, bilgi && styles.koyuBilgi]} testID="ikiz-oneri">
          {oneriCumlesi(dto)}
        </Text>
      </Card>

      <OzetKarolari
        items={[
          { label: 'Kökün tuttuğu su', value: mm(dto.state.end.taw) },
          { label: 'Rahat sınır', value: mm(dto.state.end.raw) },
          dto.gdd
            ? { label: `Derece-gün (${dto.gdd.baseC}°)`, value: String(Math.round(dto.gdd.sum)) }
            : { label: 'Sensör ölçümü', value: String(dto.observations) },
        ]}
      />

      {/* Zaman çubuğu */}
      <Bolum title="Son 14 gün ve önümüzdeki 16 gün">
        <Card style={styles.card}>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            <ZamanCubugu seri={seri} w={w} today={dto.today} />
          </View>
          <Text style={styles.small}>
            Düz çizgi: hesaplanan geçmiş. Kesikli çizgi: seçili senaryoda tahmin; gölge belirsizlik
            aralığı (p10–p90). Mavi nokta: sulama. Açık mavi: yağış.
          </Text>
        </Card>
      </Bolum>

      {/* Senaryolar */}
      <Bolum title="Ya şunu yaparsam?">
        {siralanmis.map((s, i) => {
          const o = senaryoOzeti(s, dekar);
          const aktif = i === secili;
          return (
            <Pressable
              key={s.label}
              testID={`ikiz-senaryo-${s.plan.kind}`}
              accessibilityRole="button"
              accessibilityState={{ selected: aktif }}
              onPress={() => setSecili(i)}
              style={[styles.senaryo, aktif && styles.senaryoAktif]}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.senaryoBaslik, aktif && { color: '#FFFFFF' }]}>{o.label}</Text>
                <View
                  style={[
                    styles.nokta,
                    o.tone === 'iyi' ? styles.iyi : o.tone === 'orta' ? styles.orta : styles.kotu,
                  ]}
                />
              </View>
              <Text style={[styles.senaryoSatir, aktif && styles.senaryoSatirAktif]}>{o.su}</Text>
              <Text style={[styles.senaryoSatir, aktif && styles.senaryoSatirAktif]}>
                {o.stres} · {o.sikinti}
              </Text>
              <Text style={[styles.senaryoSatir, aktif && styles.senaryoSatirAktif]}>
                {o.verim}
              </Text>
            </Pressable>
          );
        })}
        <Text style={styles.small}>
          {bilgi
            ? 'Girdiler uzman onayı beklediği için bunlar bilgi notudur; sulama kararını uzmanla ver.'
            : 'Vana kendiliğinden açılmaz; sulama kararı ve komutu senindir.'}
        </Text>
      </Bolum>

      {/* Kayıt */}
      <Bolum title="Kayıt ekle">
        <Card style={styles.card}>
          <Text style={styles.small}>
            Suladığın ya da tarlanda ölçtüğün yağışı yazarsan ikiz daha doğru olur. Sensör cihazın
            varsa ölçümler kendiliğinden işlenir.
          </Text>
          {kayitAcik ? (
            <>
              <View style={styles.secRow}>
                {(['sulama', 'yagis'] as const).map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    onPress={() => setKayitTur(k)}
                    style={[styles.sec, kayitTur === k && styles.secAktif]}
                  >
                    <Text style={[styles.secYazi, kayitTur === k && styles.secYaziAktif]}>
                      {k === 'sulama' ? 'Suladım' : 'Yağış ölçtüm'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.secRow}>
                {(['bugun', 'dun'] as const).map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    onPress={() => setKayitGun(k)}
                    style={[styles.sec, kayitGun === k && styles.secAktif]}
                  >
                    <Text style={[styles.secYazi, kayitGun === k && styles.secYaziAktif]}>
                      {k === 'bugun' ? 'Bugün' : 'Dün'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.etiket}>Kaç mm? (1 mm = dekara 1 ton su)</Text>
              <TextInput
                testID="ikiz-kayit-mm"
                value={kayitMm}
                onChangeText={setKayitMm}
                keyboardType="numeric"
                placeholder="ör. 30"
                style={styles.giris}
                accessibilityLabel="Miktar, milimetre"
              />
              {kayitHata ? <Notice tone="warn">{kayitHata}</Notice> : null}
              <Button testID="ikiz-kayit-gonder" label="Kaydet" onPress={() => void kaydet()} />
              <Button label="Vazgeç" variant="secondary" onPress={() => setKayitAcik(false)} />
            </>
          ) : (
            <Button
              testID="ikiz-kayit-ac"
              label="Sulama ya da yağış kaydı ekle"
              onPress={() => setKayitAcik(true)}
            />
          )}
          {dto.events.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              {dto.events
                .slice(-6)
                .reverse()
                .map((e) => (
                  <View key={e.id} style={styles.rowBetween}>
                    <Text style={styles.small}>
                      {kisaTarih(e.date)} · {e.kind === 'sulama' ? 'Sulama' : 'Yağış'} {mm(e.mm)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Kaydı sil"
                      onPress={() =>
                        void api.twinRemoveEvent(field.id, e.id).then(() => load(field.id))
                      }
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

      {/* Toprak */}
      {soils.length > 0 ? (
        <Bolum title="Tarlanın toprağı">
          <View style={styles.secRow}>
            {soils.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                onPress={() => {
                  setSoil(s.key);
                  void load(field.id, s.key);
                }}
                style={[styles.sec, soil === s.key && styles.secAktif]}
              >
                <Text style={[styles.secYazi, soil === s.key && styles.secYaziAktif]}>
                  {s.nameTr}
                </Text>
              </Pressable>
            ))}
          </View>
        </Bolum>
      ) : null}

      {/* Karne ve kaynaklar */}
      <Card style={styles.card} testID="ikiz-karne">
        <Text style={styles.body}>Tahmin karnesi</Text>
        <Text style={styles.small}>{karneMetni(dto.scorecard)}</Text>
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => setNeden((v) => !v)}
        style={styles.neden}
        testID="ikiz-neden"
      >
        <Text style={styles.nedenYazi}>
          {neden ? 'Nedenini gizle' : 'Neden? Nasıl hesaplandı?'}
        </Text>
      </Pressable>
      {neden ? (
        <BilgiKarti
          title="Hesap ve kaynaklar"
          lines={[
            dto.sources.method,
            `Kc: ${dto.sources.kc ?? 'yok'}`,
            `Toprak: ${dto.sources.soil ?? 'yok'}`,
            `Kök derinliği ve tükenme oranı: ${dto.sources.waterParams}`,
            `Verim-su: ${dto.sources.yield}`,
            `Hava: ${dto.weather.source} (${dto.weather.version})`,
            ...(dto.gdd ? [`Derece-gün: ${dto.gdd.source}`] : []),
            ...dto.assumptions,
            sec.yieldLoss.caveat,
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
  koyuOneri: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.body,
    color: ALTIN,
    marginTop: 4,
  },
  koyuBilgi: { color: '#CFE7E2', fontFamily: fontFamily.semibold },
  dolulukKap: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  dolulukDolu: { height: '100%', backgroundColor: '#5FD394', borderRadius: 6 },
  senaryo: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
    minHeight: 56,
  },
  senaryoAktif: { backgroundColor: colors.forest, borderColor: colors.forest },
  senaryoBaslik: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.row,
    color: colors.forest,
    flex: 1,
  },
  senaryoSatir: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  senaryoSatirAktif: { color: '#DDF1EE' },
  nokta: { width: 12, height: 12, borderRadius: 6 },
  iyi: { backgroundColor: '#5FD394' },
  orta: { backgroundColor: ALTIN },
  kotu: { backgroundColor: colors.brick },
  secRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sec: {
    minHeight: 44,
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
  etiket: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
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
  neden: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: colors.pistachio,
  },
  nedenYazi: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.pistachioText },
});
