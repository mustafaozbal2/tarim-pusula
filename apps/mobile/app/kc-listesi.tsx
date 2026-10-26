import { Text, View } from 'react-native';
import { colors } from '@tarim/ui';
import type { KcRowDto } from '../src/api/client';
import { tr } from '../src/i18n/tr';
import { kv } from '../src/offline/kvStore';
import { Cubuk, KartListesi, kartStil } from '../src/reference/Kartlar';
import { kcLevel, loadKc } from '../src/reference/load';
import { api } from '../src/session';

const t = tr.lists;
const nf = (n: number | null) =>
  n === null
    ? '-'
    : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MAX = 1.3;

/**
 * Bitkinin su ihtiyacı (G23.16): Kc tablosu yerine bitki kartı. Üç dönem (başlangıç, en büyük hali, hasat
 * öncesi) çubukla gösterilir; "az / orta / çok su içer" yazısı sayıyı okutur. Değerler FAO-56; taslak
 * değer "Taslak" yazar ve hesapta kullanılmaz (kural 1).
 */
export default function KcListScreen() {
  return (
    <KartListesi<KcRowDto & { ad: string }>
      testID="kc-tablosu"
      title={t.kcTitle}
      hero={t.kcHero}
      image="genis_gubre.jpg"
      howTitle={t.kcHow}
      howLines={[...t.kcHowLines]}
      searchLabel={t.kcSearch}
      load={async () => (await loadKc(api, kv)).map((r) => ({ ...r, ad: r.nameTr }))}
      render={(r) => {
        const level = kcLevel(r.kcMid);
        return (
          <>
            <View style={kartStil.head}>
              <Text style={kartStil.name}>{r.nameTr}</Text>
              <Text style={[kartStil.tag, !r.needsBadge && kartStil.tagOk]}>
                {r.needsBadge ? 'Taslak' : 'Onaylı'}
              </Text>
            </View>
            {level ? <Text style={kartStil.hint}>{t.kcLevel[level]}</Text> : null}
            <Cubuk label={t.kcIni} value={nf(r.kcIni)} ratio={(r.kcIni ?? 0) / MAX} />
            <Cubuk
              label={t.kcMid}
              value={nf(r.kcMid)}
              ratio={(r.kcMid ?? 0) / MAX}
              color={colors.water}
            />
            <Cubuk label={t.kcEnd} value={nf(r.kcEnd)} ratio={(r.kcEnd ?? 0) / MAX} />
          </>
        );
      }}
    />
  );
}
