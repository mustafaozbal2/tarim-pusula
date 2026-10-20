'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, clearToken, setToken } from '../lib/api';
import { Button, card, h1, input, label, Message } from '../ui';

type Step = 'phone' | 'sms' | 'enroll' | 'totp';

/** Giriş: 1) telefona SMS kodu, 2) doğrulayıcı uygulama kodu (ilk girişte önce kurulum). */
export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bağlantı kurulamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const sendSms = () =>
    run(async () => {
      await api('POST', '/auth/otp/request', { phone });
      setStep('sms');
    });

  const verifySms = () =>
    run(async () => {
      const r = await api<{ token: string }>('POST', '/auth/otp/verify', { phone, code });
      setToken(r.token);
      setCode('');
      try {
        const st = await api<{ enrolled: boolean }>('GET', '/panel/mfa');
        if (st.enrolled) {
          setStep('totp');
        } else {
          const e = await api<{ secret: string }>('POST', '/panel/mfa/enroll');
          setSecret(e.secret);
          setStep('enroll');
        }
      } catch (e) {
        clearToken();
        throw e instanceof ApiError && e.status === 403
          ? new ApiError(403, 'Bu hesap panele girebilecek bir role sahip değil.')
          : e;
      }
    });

  const verifyTotp = () =>
    run(async () => {
      await api('POST', '/panel/mfa/verify', { code });
      router.replace('/');
    });

  return (
    <main style={{ maxWidth: 480, margin: '48px auto', padding: 16 }}>
      <h1 style={h1}>Tarım Pusula Paneli</h1>
      <div style={card}>
        {step === 'phone' ? (
          <>
            <label htmlFor="tel" style={label}>
              Cep telefonu
            </label>
            <input
              id="tel"
              data-testid="giris-tel"
              style={input}
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              testId="giris-kod-iste"
              disabled={busy || !phone}
              onClick={() => void sendSms()}
            >
              SMS kodu gönder
            </Button>
          </>
        ) : null}
        {step === 'sms' ? (
          <CodeStep
            title="Telefonunuza gelen 6 haneli kodu yazın"
            code={code}
            setCode={setCode}
            busy={busy}
            onSubmit={() => void verifySms()}
            testId="giris-sms"
          />
        ) : null}
        {step === 'enroll' ? (
          <>
            <p style={{ fontSize: 18 }}>
              İkinci adım için telefonunuza bir doğrulayıcı uygulama (ör. Google Authenticator)
              kurun ve “anahtar gir” seçeneğiyle bu anahtarı ekleyin:
            </p>
            <p
              data-testid="giris-anahtar"
              style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, wordBreak: 'break-all' }}
            >
              {secret}
            </p>
            <CodeStep
              title="Uygulamanın gösterdiği 6 haneli kodu yazın"
              code={code}
              setCode={setCode}
              busy={busy}
              onSubmit={() => void verifyTotp()}
              testId="giris-totp"
            />
          </>
        ) : null}
        {step === 'totp' ? (
          <CodeStep
            title="Doğrulayıcı uygulamadaki 6 haneli kodu yazın"
            code={code}
            setCode={setCode}
            busy={busy}
            onSubmit={() => void verifyTotp()}
            testId="giris-totp"
          />
        ) : null}
        {error ? <Message kind="error">{error}</Message> : null}
      </div>
    </main>
  );
}

function CodeStep(p: {
  title: string;
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
  testId: string;
}) {
  return (
    <>
      <label htmlFor="kod" style={label}>
        {p.title}
      </label>
      <input
        id="kod"
        data-testid={p.testId}
        style={input}
        inputMode="numeric"
        maxLength={6}
        autoComplete="one-time-code"
        value={p.code}
        onChange={(e) => p.setCode(e.target.value.replace(/\D/g, ''))}
      />
      <Button
        testId={`${p.testId}-gonder`}
        disabled={p.busy || p.code.length !== 6}
        onClick={p.onSubmit}
      >
        Devam et
      </Button>
    </>
  );
}
