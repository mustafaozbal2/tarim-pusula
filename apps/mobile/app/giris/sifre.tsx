import { useRouter } from 'expo-router';
import { useState } from 'react';
import { passwordProblem } from '../../src/auth/password';
import { Alan, GirisDugme, GirisNot, GirisZemin, useIslem } from '../../src/components/Giris';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';

const t = tr.auth;

/** Şifre yenileme: telefona gelen kodla; bütün eski oturumlar kapanır. */
export default function SifreYenile() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const { busy, error, noServer, run, setError } = useIslem();

  const save = () => {
    const problem = passwordProblem(password, again);
    if (problem) return setError(problem);
    void run(async () => {
      await api.resetPassword({ phone, code, password });
      router.replace({ pathname: '/giris/ciftci', params: { yenilendi: '1' } });
    });
  };

  return (
    <GirisZemin back title={t.resetTitle} testID="giris-sifre-ekran">
      <Alan
        label={t.phone}
        value={phone}
        onChangeText={setPhone}
        placeholder="05XX XXX XX XX"
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="sifre-telefon"
      />
      {sent ? (
        <>
          <GirisNot tone="bilgi">{t.codeSent}</GirisNot>
          <Alan
            label={t.code}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            testID="sifre-kod"
          />
          <Alan
            label={t.passwordNew}
            value={password}
            onChangeText={setPassword}
            secret
            autoComplete="new-password"
            hint={t.passwordHint}
            testID="sifre-yeni"
          />
          <Alan
            label={t.passwordAgain}
            value={again}
            onChangeText={setAgain}
            secret
            autoComplete="new-password"
            testID="sifre-yeni2"
          />
        </>
      ) : null}
      {error ? <GirisNot>{error}</GirisNot> : null}
      {noServer ? <SunucuKarti /> : null}
      {sent ? (
        <GirisDugme label={t.resetDo} busy={busy} testID="sifre-kaydet" onPress={save} />
      ) : (
        <GirisDugme
          label={t.sendCode}
          busy={busy}
          testID="sifre-kod-gonder"
          onPress={() =>
            void run(async () => {
              await api.requestOtp(phone);
              setSent(true);
            })
          }
        />
      )}
    </GirisZemin>
  );
}
