import { hedefRef } from '../src/tanitim/hedef';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { sonGunYakin } from '@tarim/agro-core';
import { Button, Card, colors, Durum, fontFamily, fontSize } from '@tarim/ui';
import type { HaftalikOzetDto } from '../src/api/client';
import { Screen } from '../src/components/Screen';
import { Iskelet, YuklemeHatasi } from '../src/components/Yukleme';
import { fiyatDegisimi, gunTr, kalanGun, UYARI_ADI } from '../src/haftalik/view';
import { withDeadline } from '../src/load/deadline';
import { api } from '../src/session';

/**
 * Haftalık özet: il ve ürünlere göre açık destek/hibe başvuruları (resmî kaynak, son gün, bağlantı),
 * önümüzdeki 14 günün kritik tarihleri, geçen haftanın uyarıları ve hal fiyatı değişimi.
 * Her pazartesi sabah bildirim olarak da gelir.
 */
export default function HaftalikOzet() {
  const [o, setO] = useState<HaftalikOzetDto | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setO(await withDeadline(api.haftalikOzet()));
    } catch {
      setFailed(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const ac = (url: string | null) =>
    url?.startsWith('https://') ? () => void Linking.openURL(url) : undefined;

  return (
    <Screen title="Haftalık özet">
      <Text style={styles.small}>
        Arazilerinizin iline ve ürününe göre hazırlanır. Her pazartesi bildirim olarak da gelir.
      </Text>
      {o === null && !failed ? <Iskelet /> : null}
      {failed ? <YuklemeHatasi onRetry={() => void load()} /> : null}
      {o?.not ? <Durum kind="bos" text={o.not} /> : null}
      {o ? (
        <>
          <Text style={styles.baslik}>Açık destek ve hibe başvuruları</Text>
          <View style={styles.liste} ref={hedefRef('haftalik.destek')}>
            {o.destekler.length === 0 ? (
              <Durum kind="bos" text="Şu an size uyan açık başvuru yok." />
            ) : null}
            {o.destekler.map((d) => (
              <Card key={d.id} style={styles.card}>
                <Text style={styles.ad}>{d.baslik}</Text>
                <Text
                  style={[styles.body, sonGunYakin(d.sonGun, o.bugun) && { color: colors.brick }]}
                >
                  {d.sonGun
                    ? `${sonGunYakin(d.sonGun, o.bugun) ? 'Son günler, kaçırmayın. ' : ''}Son gün: ${gunTr(d.sonGun)} (${kalanGun(d.sonGun, o.bugun)})`
                    : 'Son gün duyuruda yazmıyor'}
                </Text>
                <Text style={styles.small}>
                  Kaynak: {d.kaynak}, {gunTr(d.kaynakTarihi)} · {d.tarlalar.join(', ')}
                </Text>
                {ac(d.kaynakUrl) ? (
                  <Button label="Resmî sayfayı aç" variant="secondary" onPress={ac(d.kaynakUrl)!} />
                ) : null}
              </Card>
            ))}
          </View>

          <Text style={styles.baslik}>Yaklaşan kritik tarihler (14 gün)</Text>
          <View style={styles.liste} ref={hedefRef('haftalik.tarih')}>
            {o.tarihler.length === 0 ? (
              <Durum kind="bos" text="Önümüzdeki 14 günde kayıtlı kritik tarih yok." />
            ) : null}
            {o.tarihler.map((t, i) => (
              <Card key={`${t.tarih}-${i}`} style={styles.satir}>
                <Text style={styles.tarih}>{gunTr(t.tarih)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body}>{t.baslik}</Text>
                  <Text style={styles.small}>
                    {[t.tarla, kalanGun(t.tarih, o.bugun), `Kaynak: ${t.kaynak}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </Card>
            ))}
          </View>

          <Text style={styles.baslik}>Geçen haftanın uyarıları</Text>
          <View style={styles.liste} ref={hedefRef('haftalik.uyari')}>
            {o.uyarilar.length === 0 ? (
              <Durum kind="bos" text="Geçen hafta uyarı gönderilmedi." />
            ) : null}
            {o.uyarilar.map((u) => (
              <Card key={`${u.tur}-${u.tarla}-${u.tarih}`} style={styles.satir}>
                <Text style={styles.tarih}>{gunTr(u.tarih)}</Text>
                <Text style={[styles.body, { flex: 1 }]}>
                  {UYARI_ADI[u.tur]} · {u.tarla}
                </Text>
              </Card>
            ))}
          </View>

          <Text style={styles.baslik}>Ürünlerinizin hal fiyatı</Text>
          <View style={styles.liste} ref={hedefRef('haftalik.fiyat')}>
            {o.fiyatlar.length === 0 ? (
              <Durum kind="bos" text="Karşılaştırılacak güncel hal fiyatı yok." />
            ) : null}
            {o.fiyatlar.map((f) => {
              const d = fiyatDegisimi(f.degisimPct);
              return (
                <Card key={f.cropId} style={styles.card}>
                  <Text style={styles.ad}>
                    {f.urun} · {f.yer}
                  </Text>
                  <Text
                    style={[
                      styles.body,
                      d.yon === 'artis' && { color: colors.forest },
                      d.yon === 'dusus' && { color: colors.brick },
                    ]}
                  >
                    {f.son.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL/kg, geçen
                    haftaya göre {d.metin}
                  </Text>
                  <Text style={styles.small}>
                    {gunTr(f.oncekiTarih)}:{' '}
                    {f.onceki.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL/kg · Kaynak:{' '}
                    {f.kaynak}, {gunTr(f.sonTarih)}
                  </Text>
                </Card>
              );
            })}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  liste: { gap: 8 },
  card: { gap: 6 },
  satir: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  baslik: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.body,
    color: colors.forest,
    marginTop: 8,
  },
  ad: { fontFamily: fontFamily.bold, fontSize: fontSize.body, color: colors.forest },
  tarih: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.body, color: colors.forest },
  small: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
});
