import { Text, View } from 'react-native';
import { colors, fontFamily } from '@tarim/ui';
import type { SoilRowDto } from '../src/api/client';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { KartListesi, kartStil } from '../src/reference/Kartlar';
import { loadSoils, soilStars } from '../src/reference/load';
import { api } from '../src/session';

const t = tr.lists;
const nf = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/**
 * Toprak türleri (G23.16): FAO-56 Tablo 19'un 9 doku sınıfı. Her kartta elle tutunca nasıl olduğu
 * (tarif), suyu ne kadar tuttuğu (1-5 damla) ve hesap değerleri. Taslak değer hesapta kullanılmaz.
 */
export default function SoilListScreen() {
  return (
    <KartListesi<SoilRowDto & { id: string; ad: string }>
      testID="toprak-tablosu"
      title={t.soilTitle}
      hero={t.soilHero}
      image="genis_gubre.jpg"
      howTitle={t.soilHow}
      howLines={[...t.soilHowLines]}
      searchLabel={t.soilSearch}
      load={async () => (await loadSoils(api, kv)).map((r) => ({ ...r, id: r.key, ad: r.nameTr }))}
      render={(r) => {
        const stars = soilStars(r.thetaFc, r.thetaWp);
        return (
          <>
            <View style={kartStil.head}>
              <Text style={kartStil.name}>{r.nameTr}</Text>
              <Text style={[kartStil.tag, !r.needsBadge && kartStil.tagOk]}>
                {r.needsBadge ? 'Taslak' : 'Onaylı'}
              </Text>
            </View>
            {r.hint ? <Text style={kartStil.hint}>{r.hint}</Text> : null}
            <View style={kartStil.head}>
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 13, color: colors.forest }}>
                {t.holdsWater}
              </Text>
              <Text
                accessibilityLabel={`${stars} / 5`}
                style={{ fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.water }}
              >
                {'●'.repeat(stars)}
                <Text style={{ color: colors.border }}>{'●'.repeat(5 - stars)}</Text>
              </Text>
            </View>
            <Text style={kartStil.hint}>
              {t.fc}: {nf(r.thetaFc)} · {t.wp}: {nf(r.thetaWp)} · {t.whc}:{' '}
              {Math.round(1000 * (r.thetaFc - r.thetaWp))}
            </Text>
          </>
        );
      }}
    />
  );
}
