import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';
import { fontFamily } from '@tarim/ui';
import type { GeceDonuDto } from '../api/client';
import { donRehberi } from '../today/donRehberi';

const ALTIN = '#F2B84B';

/** Gecenin saatlik sıcaklık çizgisi; 0° kesikli çizgi, 0° altı gölgeli, en düşük nokta işaretli. */
function Grafik({ g, w }: { g: GeceDonuDto; w: number }) {
  const h = 120;
  const pad = { l: 8, r: 8, t: 10, b: 24 };
  const pts = g.saatler;
  if (pts.length < 2) return null;
  const ts = pts.map((p) => p.tempC);
  const mx = Math.max(...ts, 1);
  const mn = Math.min(...ts, -1);
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / (pts.length - 1);
  const y = (t: number) => pad.t + ((mx - t) * (h - pad.t - pad.b)) / (mx - mn);
  const sifir = y(0);
  const cizgi = pts.map((p, i) => `${x(i)},${y(p.tempC)}`).join(' ');
  // 0° altı alan: çizgi ile 0° arası (yalnız eksi kısım).
  let alan = '';
  pts.forEach((p, i) => {
    const yy = Math.max(y(p.tempC), sifir);
    alan += `${i === 0 ? 'M' : 'L'}${x(i)},${yy} `;
  });
  alan += `L${x(pts.length - 1)},${sifir} L${x(0)},${sifir} Z`;
  const en = ts.indexOf(Math.min(...ts));
  const etiket = pts
    .map((p, i) => ({ p, i }))
    .filter(
      ({ p, i }) => i === 0 || i === pts.length - 1 || p.saat === '00:00' || p.saat === '06:00',
    );
  return (
    <Svg width={w} height={h}>
      <Line
        x1={pad.l}
        x2={w - pad.r}
        y1={sifir}
        y2={sifir}
        stroke="#9FC9C3"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <SvgText x={pad.l} y={sifir - 4} fill="#CFE7E2" fontSize={11}>
        0°
      </SvgText>
      <Path d={alan} fill="#7FB3D5" fillOpacity={0.35} />
      <Polyline
        points={cizgi}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ts[en]! <= 0 ? (
        <>
          <Circle cx={x(en)} cy={y(ts[en]!)} r={5} fill={ALTIN} />
          <SvgText
            x={x(en)}
            y={y(ts[en]!) + 18}
            fill={ALTIN}
            fontSize={12}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`${Math.round(ts[en]!)}°`}
          </SvgText>
        </>
      ) : null}
      {etiket.map(({ p, i }) => (
        <SvgText
          key={i}
          x={x(i)}
          y={h - 6}
          fill="#CFE7E2"
          fontSize={11}
          textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
        >
          {p.saat}
        </SvgText>
      ))}
    </Svg>
  );
}

/**
 * Ana sayfa don kartı: yalnız bu gece hava sıcaklığı 0° ve altına iniyorsa görünür (WMO hava donu tanımı;
 * kaynak: tahmin). "Neler yapabilirim?" kaynaklı bilgi notunu açar (uzman onayı bekliyor rozetli).
 */
export function DonKarti({
  g,
  cropId,
  kaynak,
  digerAdlar,
}: {
  g: GeceDonuDto;
  cropId: string | null;
  kaynak: string;
  digerAdlar: string[];
}) {
  const [w, setW] = useState(0);
  const [acik, setAcik] = useState(false);
  const r = donRehberi(cropId, g.tur);
  const aralik =
    g.baslangic && g.bitis
      ? `${g.baslangic} - ${g.bitis} arası sıcaklık ${Math.round(g.enDusukC ?? 0)} dereceye iniyor.`
      : '';
  return (
    <View style={s.kart} testID="don-karti" onLayout={(e) => setW(e.nativeEvent.layout.width - 36)}>
      <Text style={s.baslik} accessibilityRole="header">
        Bu gece don var
      </Text>
      <Text style={s.alt}>{aralik}</Text>
      {digerAdlar.length ? <Text style={s.diger}>{`Ayrıca: ${digerAdlar.join(', ')}`}</Text> : null}
      {w > 0 ? <Grafik g={g} w={w} /> : <View style={{ height: 120 }} />}
      <Pressable
        accessibilityRole="button"
        testID="don-ne-yapabilirim"
        onPress={() => setAcik(true)}
        style={s.dugme}
      >
        <Text style={s.dugmeYazi}>Neler yapabilirim?</Text>
      </Pressable>
      <Text style={s.kaynak}>{kaynak}</Text>

      <Modal visible={acik} animationType="slide" transparent onRequestClose={() => setAcik(false)}>
        <View style={s.perde}>
          <View style={s.sayfa}>
            <View style={s.sayfaUst}>
              <Text style={s.sayfaBaslik}>Dona karşı neler yapılabilir?</Text>
              <Pressable accessibilityRole="button" onPress={() => setAcik(false)} style={s.kapat}>
                <Text style={s.kapatYazi}>Kapat</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
              <Text style={s.rozet}>Bilgi notu · uzman onayı bekliyor</Text>
              <Text style={s.giris}>{r.giris}</Text>
              <Bolum ad="Bu gece" liste={r.hemen} />
              <Bolum ad="Dondan sonra" liste={r.sonra} />
              <Bolum ad="Yapmayın" liste={r.yapmayin} kirmizi />
              <Text style={s.kaynakBaslik}>Kaynaklar</Text>
              {r.kaynaklar.map((k) => (
                <Text key={k} style={s.kaynakSatir}>
                  {`• ${k}`}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Bolum({
  ad,
  liste,
  kirmizi,
}: {
  ad: string;
  liste: ReturnType<typeof donRehberi>['hemen'];
  kirmizi?: boolean;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[s.bolum, kirmizi && { color: '#B23A2B' }]}>{ad}</Text>
      {liste.map((y) => (
        <View key={y.baslik} style={s.madde}>
          <Text style={s.maddeBaslik}>{y.baslik}</Text>
          <Text style={s.maddeMetin}>{y.metin}</Text>
          <Text style={s.maddeKaynak}>{`Kaynak: ${y.kaynak}`}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  kart: {
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#0E3B37',
  },
  baslik: { fontFamily: fontFamily.extrabold, fontSize: 30, color: '#FFFFFF', letterSpacing: -0.5 },
  alt: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: '#E6F3F0',
    marginTop: 4,
    lineHeight: 21,
  },
  diger: { fontFamily: fontFamily.bold, fontSize: 13, color: ALTIN, marginTop: 4 },
  dugme: {
    backgroundColor: ALTIN,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  dugmeYazi: { fontFamily: fontFamily.extrabold, fontSize: 16, color: '#1E2A28' },
  kaynak: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#9FC9C3',
    textAlign: 'center',
    marginTop: 10,
  },
  perde: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sayfa: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    padding: 18,
  },
  sayfaUst: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sayfaBaslik: { fontFamily: fontFamily.extrabold, fontSize: 19, color: '#0E3B37', flex: 1 },
  kapat: { paddingVertical: 8, paddingHorizontal: 12 },
  kapatYazi: { fontFamily: fontFamily.bold, fontSize: 15, color: '#3D8E8D' },
  rozet: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF1D6',
    color: '#8A5A00',
    fontFamily: fontFamily.bold,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  giris: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: '#33433F',
    marginTop: 10,
    lineHeight: 20,
  },
  bolum: { fontFamily: fontFamily.extrabold, fontSize: 16, color: '#0E3B37', marginBottom: 6 },
  madde: { backgroundColor: '#F2F7F6', borderRadius: 12, padding: 12, marginBottom: 8 },
  maddeBaslik: { fontFamily: fontFamily.bold, fontSize: 15, color: '#14302D' },
  maddeMetin: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: '#33433F',
    marginTop: 4,
    lineHeight: 20,
  },
  maddeKaynak: { fontFamily: fontFamily.medium, fontSize: 12, color: '#7B948F', marginTop: 6 },
  kaynakBaslik: { fontFamily: fontFamily.extrabold, fontSize: 14, color: '#0E3B37', marginTop: 16 },
  kaynakSatir: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#5B726D',
    marginTop: 4,
    lineHeight: 17,
  },
});
