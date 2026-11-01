import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alan, GirisDugme, GirisNot, GirisZemin, useIslem } from '../../src/components/Giris';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { DEMO_BUILD, loadDemoInfo } from '../../src/demo';
import { tr } from '../../src/i18n/tr';
import { api, apiWith, setSessionKind, setToken } from '../../src/session';

const t = tr.auth;

/**
 * Yetkili girişi: telefon + şifre, ardından SMS güvenlik kodu (ikinci adım). Kod doğrulanana kadar
 * jeton cihaza yazılmaz: yarım kalan giriş oturum açmaz.
 */
export default function YetkiliGiris() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const { busy, error, noServer, run, setError } = useIslem();

  useEffect(() => {
    if (!DEMO_BUILD) return;
    void loadDemoInfo(() => api.demoInfo()).then((info) => {
      if (info) setPhone((p) => p || info.staffPhone);
    });
  }, []);

  const login = () =>
    void run(async () => {
      const r = await api.login(phone, password);
      if (!r.mfaRequired) {
        setError(t.staffOnly);
        return;
      }
      await apiWith(r.token).mfaSmsRequest();
      setPending(r.token);
    });
  const verify = () =>
    void run(async () => {
      if (!pending) return;
      await apiWith(pending).mfaSmsVerify(code);
      await setSessionKind('yetkili');
      await setToken(pending);
    });

  return (
    <GirisZemin back title={pending ? t.smsStepTitle : t.staffTitle} testID="giris-yetkili-ekran">
      {pending ? (
        <>
          <GirisNot tone="bilgi">{t.smsStepText}</GirisNot>
          <Alan
            label={t.code}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            testID="yetkili-kod"
          />
        </>
      ) : (
        <>
          <Alan
            label={t.phone}
            value={phone}
            onChangeText={setPhone}
            placeholder="05XX XXX XX XX"
            keyboardType="phone-pad"
            autoComplete="tel"
            testID="yetkili-telefon"
          />
          <Alan
            label={t.password}
            value={password}
            onChangeText={setPassword}
            secret
            autoComplete="password"
            testID="yetkili-sifre"
          />
        </>
      )}
      {error ? <GirisNot>{error}</GirisNot> : null}
      {noServer ? <SunucuKarti /> : null}
      {pending ? (
        <GirisDugme label={t.verify} busy={busy} testID="yetkili-dogrula" onPress={verify} />
      ) : (
        <>
          <GirisDugme label={t.login} busy={busy} testID="yetkili-gir" onPress={login} />
          <GirisDugme
            label={t.staffApply}
            tone="ikinci"
            testID="yetkili-basvuru"
            onPress={() => router.push('/giris/yetkili-kayit')}
          />
          <GirisDugme label={t.forgot} tone="yazi" onPress={() => router.push('/giris/sifre')} />
        </>
      )}
    </GirisZemin>
  );
}
