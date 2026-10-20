import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button, colors, fontFamily, fontSize, radius } from '@tarim/ui';
import { ApiError, NetworkError } from '../src/api/client';
import { FlowScreen, Notice, subtitleStyle, titleStyle } from '../src/components/FlowParts';
import { tr } from '../src/i18n/tr';
import { api, setToken } from '../src/session';

const t = tr.login;

const input = {
  minHeight: 64,
  borderRadius: radius.row,
  borderWidth: 2,
  borderColor: colors.forest,
  backgroundColor: colors.surface,
  paddingHorizontal: 16,
  fontFamily: fontFamily.extrabold,
  fontSize: 28,
  color: colors.forest,
} as const;

/** Telefon + SMS kodu. TC kimlik no sorulmaz. */
export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof NetworkError ? t.noNet : e instanceof ApiError ? e.message : t.wrong);
    }
  }

  return (
    <FlowScreen
      footer={
        sent ? (
          <Button
            label={t.enter}
            onPress={() =>
              void run(async () => {
                const r = await api.verifyOtp(phone, code);
                await setToken(r.token);
                router.replace('/');
              })
            }
          />
        ) : (
          <Button
            label={t.sendCode}
            onPress={() =>
              void run(async () => {
                await api.requestOtp(phone);
                setSent(true);
              })
            }
          />
        )
      }
    >
      <Text accessibilityRole="header" style={[titleStyle, { paddingTop: 48 }]}>
        {t.title}
      </Text>
      <Text style={subtitleStyle}>{sent ? t.code : t.phone}</Text>
      {sent ? (
        <TextInput
          testID="giris-kod"
          accessibilityLabel={t.code}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          style={input}
        />
      ) : (
        <TextInput
          testID="giris-telefon"
          accessibilityLabel={t.phone}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="05XX XXX XX XX"
          style={input}
        />
      )}
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Text
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.small,
          color: colors.textMuted,
        }}
      >
        {tr.app.slogan}
      </Text>
    </FlowScreen>
  );
}
