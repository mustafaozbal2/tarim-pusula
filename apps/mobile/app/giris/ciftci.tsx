import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alan, GirisDugme, GirisNot, GirisZemin, useIslem } from '../../src/components/Giris';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { DEMO_BUILD, loadDemoInfo } from '../../src/demo';
import { tr } from '../../src/i18n/tr';
import { api, setSessionKind, setToken } from '../../src/session';

const t = tr.auth;

/** Çiftçi girişi: telefon + şifre. Her gün giriş istenmez (oturum kullandıkça uzar, 90 gün). */
export default function CiftciGiris() {
  const router = useRouter();
  const { yenilendi } = useLocalSearchParams<{ yenilendi?: string }>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, noServer, run, setError } = useIslem();

  useEffect(() => {
    if (!DEMO_BUILD) return;
    void loadDemoInfo(() => api.demoInfo()).then((info) => {
      if (info) setPhone((p) => p || info.farmerPhone);
    });
  }, []);

  const login = () =>
    run(async () => {
      const r = await api.login(phone, password);
      if (r.mfaRequired) {
        setError(t.farmerOnly);
        return;
      }
      await setSessionKind('ciftci');
      await setToken(r.token);
    });

  return (
    <GirisZemin back title={t.farmerTitle} testID="giris-ciftci-ekran">
      {yenilendi ? <GirisNot tone="bilgi">{t.resetDone}</GirisNot> : null}
      <Alan
        label={t.phone}
        value={phone}
        onChangeText={setPhone}
        placeholder="05XX XXX XX XX"
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="giris-telefon"
      />
      <Alan
        label={t.password}
        value={password}
        onChangeText={setPassword}
        secret
        autoComplete="password"
        testID="giris-sifre"
      />
      {error ? <GirisNot>{error}</GirisNot> : null}
      {noServer ? <SunucuKarti /> : null}
      <GirisDugme label={t.login} busy={busy} testID="giris-gir" onPress={() => void login()} />
      <GirisDugme
        label={t.noAccount}
        tone="ikinci"
        testID="giris-kayit"
        onPress={() => router.push('/giris/kayit')}
      />
      <GirisDugme label={t.forgot} tone="yazi" onPress={() => router.push('/giris/sifre')} />
    </GirisZemin>
  );
}
