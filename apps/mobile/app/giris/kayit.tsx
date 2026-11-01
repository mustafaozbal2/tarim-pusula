import { useState } from 'react';
import { passwordProblem } from '../../src/auth/password';
import { Alan, GirisDugme, GirisNot, GirisZemin, Onay, useIslem } from '../../src/components/Giris';
import { SunucuKarti } from '../../src/components/SunucuKarti';
import { tr } from '../../src/i18n/tr';
import { api, setSessionKind, setToken } from '../../src/session';

const t = tr.auth;

/** Çiftçi kaydı: ad, telefon, şifre, KVKK onayı; telefon SMS koduyla doğrulanır. */
export default function CiftciKayit() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const { busy, error, noServer, run, setError } = useIslem();

  const sendCode = () => {
    const problem = passwordProblem(password, again);
    if (problem) return setError(problem);
    if (!kvkk) return setError(t.kvkkMissing);
    void run(async () => {
      await api.requestOtp(phone);
      setSent(true);
    });
  };
  const finish = () =>
    void run(async () => {
      const r = await api.register({
        phone,
        code,
        password,
        name: name.trim() || undefined,
        kvkk: true,
      });
      await setSessionKind('ciftci');
      await setToken(r.token);
    });

  return (
    <GirisZemin back title={t.registerTitle} testID="giris-kayit-ekran">
      {!sent ? (
        <>
          <Alan
            label={t.name}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            testID="kayit-ad"
          />
          <Alan
            label={t.phone}
            value={phone}
            onChangeText={setPhone}
            placeholder="05XX XXX XX XX"
            keyboardType="phone-pad"
            autoComplete="tel"
            testID="kayit-telefon"
          />
          <Alan
            label={t.passwordNew}
            value={password}
            onChangeText={setPassword}
            secret
            autoComplete="new-password"
            hint={t.passwordHint}
            testID="kayit-sifre"
          />
          <Alan
            label={t.passwordAgain}
            value={again}
            onChangeText={setAgain}
            secret
            autoComplete="new-password"
            testID="kayit-sifre2"
          />
          <Onay checked={kvkk} onChange={setKvkk} testID="kayit-kvkk">
            {t.kvkk}
          </Onay>
        </>
      ) : (
        <>
          <GirisNot tone="bilgi">{t.codeSent}</GirisNot>
          <Alan
            label={t.code}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            testID="kayit-kod"
          />
        </>
      )}
      {error ? <GirisNot>{error}</GirisNot> : null}
      {noServer ? <SunucuKarti /> : null}
      {sent ? (
        <GirisDugme label={t.finish} busy={busy} testID="kayit-bitir" onPress={finish} />
      ) : (
        <GirisDugme label={t.sendCode} busy={busy} testID="kayit-kod-gonder" onPress={sendCode} />
      )}
    </GirisZemin>
  );
}
