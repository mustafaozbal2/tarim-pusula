import { tanitimSifirla } from '../src/tanitim/durum';
import { hedefRef } from '../src/tanitim/hedef';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize, SekmeAnahtari, spacing } from '@tarim/ui';
import { Bolum, IkonKart, KartIzgara, SayfaGorseli } from '../src/components/Gorsel';
import { Screen } from '../src/components/Screen';
import { SunucuKarti } from '../src/components/SunucuKarti';
import { tr } from '../src/i18n/tr';
import type { BildirimAyarDto, DavetDto } from '../src/api/client';
import { api, currentApiUrl, setToken } from '../src/session';
import { updateSettings, useSettings } from '../src/settings';
import { nextTap, type TapState } from '../src/settingsCore';
import { expoUpdates, syncUpdate, updateDate, type UpdateResult } from '../src/updates';
import type { TextSize } from '@tarim/ui';

const t = tr.settings;

/** Uygulama sürümü: app.json "version" alanı. */
export const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

export default function SettingsScreen() {
  const router = useRouter();
  const s = useSettings();
  const [server, setServer] = useState<string | null | undefined>(undefined);
  const taps = useRef<TapState>({ count: 0, last: 0 });
  const [devNote, setDevNote] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateResult | 'bekliyor' | null>(null);
  const updated = updateDate();
  const [acil, setAcil] = useState<BildirimAyarDto | null | undefined>(undefined);
  const [davet, setDavet] = useState<DavetDto | null | undefined>(undefined);
  const checkUpdate = () => {
    setUpdate('bekliyor');
    void syncUpdate(expoUpdates).then(setUpdate);
  };
  // Sürüm numarasına 7 dokunuş geliştirici modunu açar (sunucu adresi kartı yalnız onda görünür).
  const onVersionTap = () => {
    const r = nextTap(taps.current, Date.now());
    taps.current = r.state;
    if (r.unlocked) {
      void updateSettings({ devMode: !s.devMode });
      setDevNote(s.devMode ? t.devOff : t.devOn);
    }
  };
  useEffect(() => {
    void currentApiUrl().then(setServer);
    void api
      .davet()
      .then(setDavet)
      .catch(() => setDavet(null));
    void api
      .bildirimAyar()
      .then(setAcil)
      .catch(() => setAcil(null));
  }, []);
  const acilDegistir = (alan: 'sms' | 'whatsapp', acik: boolean) => {
    if (!acil) return;
    const once = acil;
    setAcil({ ...acil, [alan]: acik });
    void api
      .bildirimAyarKaydet({ [alan]: acik })
      .then(setAcil)
      .catch(() => setAcil(once));
  };

  return (
    <Screen title={t.title}>
      <SayfaGorseli image="genis_ciftciler.jpg" text={t.hero} />

      <Bolum title={t.myData}>
        <IkonKart
          wide
          icon="book"
          title={tr.wallet.open}
          hint={t.walletHint}
          ref={hedefRef('ayar.cuzdan')}
          testID="ayar-veri-cuzdani"
          onPress={() => router.push('/veri-cuzdani')}
        />
        <IkonKart
          wide
          icon="chip"
          title={tr.cks.open}
          hint={t.cksHint}
          ref={hedefRef('ayar.cks')}
          testID="ayar-cks"
          onPress={() => router.push('/entegrasyonlar')}
        />
        <IkonKart
          wide
          icon="bell"
          title={tr.reminders.open}
          hint={t.reminderHint}
          ref={hedefRef('ayar.hatirlatici')}
          testID="ayar-hatirlatici"
          onPress={() => router.push('/hatirlaticilar')}
        />
      </Bolum>

      <Bolum title={t.lists}>
        <IkonKart
          wide
          icon="book"
          title={tr.resmiKaynak.open}
          hint={tr.resmiKaynak.hint}
          ref={hedefRef('ayar.kaynak')}
          testID="ayar-resmi-kaynaklar"
          onPress={() => router.push('/resmi-kaynaklar')}
        />
        <KartIzgara>
          <IkonKart
            icon="drop"
            title={tr.lists.open}
            hint={t.kcHint}
            onPress={() => router.push('/kc-listesi')}
          />
          <IkonKart
            image="ikon_toprak.png"
            title={tr.lists.openSoil}
            hint={t.soilHint}
            onPress={() => router.push('/toprak-turleri')}
          />
        </KartIzgara>
      </Bolum>

      <Card style={styles.card}>
        <Text style={styles.label}>{t.voice}</Text>
        <SekmeAnahtari<'on' | 'off'>
          ref={hedefRef('ayar.ses')}
          testID="ayar-ses"
          value={s.voiceGuide ? 'on' : 'off'}
          onChange={(v) => void updateSettings({ voiceGuide: v === 'on' })}
          options={[
            { key: 'on', label: t.voiceOn },
            { key: 'off', label: t.voiceOff },
          ]}
        />
        <Text style={styles.hint}>{t.voiceHint}</Text>
      </Card>

      <Card style={styles.card} testID="ayar-acil">
        <Text style={styles.label}>{t.acil}</Text>
        <Text style={styles.hint}>{t.acilHint}</Text>
        {acil ? (
          <>
            <Text style={styles.value}>{t.acilSms}</Text>
            <SekmeAnahtari<'on' | 'off'>
              testID="ayar-acil-sms"
              value={acil.sms ? 'on' : 'off'}
              onChange={(v) => acilDegistir('sms', v === 'on')}
              options={[
                { key: 'on', label: t.voiceOn },
                { key: 'off', label: t.voiceOff },
              ]}
            />
            <Text style={styles.value}>{t.acilWhatsapp}</Text>
            <SekmeAnahtari<'on' | 'off'>
              testID="ayar-acil-whatsapp"
              value={acil.whatsapp ? 'on' : 'off'}
              onChange={(v) => acilDegistir('whatsapp', v === 'on')}
              options={[
                { key: 'on', label: t.voiceOn },
                { key: 'off', label: t.voiceOff },
              ]}
            />
            {acil.whatsappHazir ? null : <Text style={styles.hint}>{t.acilWhatsappKapali}</Text>}
          </>
        ) : acil === null ? (
          <Text style={styles.hint}>{t.acilHata}</Text>
        ) : null}
      </Card>

      <Card style={styles.card} testID="ayar-davet">
        <Text style={styles.label}>{t.davet}</Text>
        <Text style={styles.hint}>{t.davetHint}</Text>
        {davet?.kod ? (
          <>
            <View style={styles.row}>
              <Text style={styles.hint}>{t.davetKod}</Text>
              <Text style={styles.value} testID="ayar-davet-kod" selectable>
                {davet.kod}
              </Text>
            </View>
            <Text style={styles.hint} testID="ayar-davet-sayi">
              {t.davetKatilan.replace('{{n}}', String(davet.katilan))}
            </Text>
            <Button
              label={t.davetPaylas}
              testID="ayar-davet-paylas"
              onPress={() => void Share.share({ message: davet.metin ?? davet.kod ?? '' })}
            />
          </>
        ) : davet === null ? (
          <Text style={styles.hint}>{t.davetHata}</Text>
        ) : null}
      </Card>

      <Card style={styles.card} ref={hedefRef('ayar.hakkinda')} testID="ayar-hakkinda">
        <Text style={styles.label}>{t.about}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.version} ${APP_VERSION}`}
          testID="ayar-surum-dugme"
          onPress={onVersionTap}
          style={styles.tapRow}
        >
          <Text style={styles.hint}>{t.version}</Text>
          <Text style={styles.value} testID="ayar-surum">
            {APP_VERSION}
          </Text>
        </Pressable>
        {updated ? (
          <View style={styles.row}>
            <Text style={styles.hint}>{t.updatedAt}</Text>
            <Text style={styles.value}>{updated.toLocaleDateString('tr-TR')}</Text>
          </View>
        ) : null}
        <Button
          label={t.updateCheck}
          variant="secondary"
          ref={hedefRef('ayar.guncelle')}
          testID="ayar-guncelle"
          onPress={update === 'bekliyor' ? undefined : checkUpdate}
        />
        <Text style={styles.hint} testID="ayar-guncelle-durum">
          {update ? t.updateStates[update] : t.updateAuto}
        </Text>
        <View style={styles.row}>
          <Text style={styles.hint}>{t.server}</Text>
          <Text style={styles.value} testID="ayar-sunucu">
            {server ?? t.serverNone}
          </Text>
        </View>
        {devNote ? <Text style={styles.hint}>{devNote}</Text> : null}
        <Text style={styles.hint}>{tr.app.slogan}</Text>
        <Text style={[styles.label, styles.sourcesTitle]}>{t.sources}</Text>
        <View testID="ayar-kaynaklar" style={styles.sources}>
          {t.sourceList.map((x) => (
            <Text key={x} style={styles.hint}>
              {'•'} {x}
            </Text>
          ))}
        </View>
      </Card>

      {s.devMode ? <SunucuKarti variant="settings" /> : null}

      <Card style={styles.card}>
        <Text style={styles.label}>{t.textSize}</Text>
        <SekmeAnahtari<TextSize>
          ref={hedefRef('ayar.yazi')}
          testID="ayar-yazi-boyutu"
          value={s.textSize}
          onChange={(v) => void updateSettings({ textSize: v })}
          options={[
            { key: 'normal', label: t.normal },
            { key: 'large', label: t.large },
          ]}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.label}>Uygulama tanıtımı</Text>
        <Text style={styles.hint}>
          Karşılama kartını ve her sayfanın adım adım anlatımını ilk girişteki gibi yeniden
          gösterir. Tek bir sayfayı yeniden anlatmak için o sayfanın üstündeki mavi ampule dokunman
          yeter.
        </Text>
        <Button
          ref={hedefRef('ayar.tanitim')}
          label="Tanıtımı baştan göster"
          variant="secondary"
          testID="ayar-tanitim"
          onPress={() => {
            void tanitimSifirla().then(() => router.replace('/'));
          }}
        />
      </Card>

      <Button
        ref={hedefRef('ayar.cikis')}
        label={t.logout}
        variant="danger"
        onPress={() => {
          void setToken(null).then(() => router.replace('/giris'));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  label: { fontFamily: fontFamily.extrabold, fontSize: fontSize.row, color: colors.forest },
  hint: { fontFamily: fontFamily.medium, fontSize: fontSize.small, color: colors.textMuted },
  value: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.forest },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
  },
  sourcesTitle: { marginTop: spacing.md },
  sources: { gap: 4 },
});
