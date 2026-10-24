import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, colors, fontFamily, fontSize } from '@tarim/ui';
import {
  FlowHeader,
  FlowScreen,
  Notice,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import { PendingProposals } from '../../src/components/Proposals';
import { resetDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';
import { api } from '../../src/session';

const t = tr.flow;

/** "123 456" biçimi: yaşlı gözüne kolay okunur. */
export const formatCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

/** Yakınım yapsın (çiftçi tarafı): kod al, yakınına söyle, gelen öneriyi onayla. */
export default function NearbyScreen() {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState(false);

  async function getCode() {
    setError(false);
    try {
      setCode(await api.nearbyCreateCode());
    } catch {
      setError(true);
    }
  }

  return (
    <FlowScreen
      footer={
        <>
          <Pressable
            testID="kodum-var"
            accessibilityRole="button"
            onPress={() => router.push('/tarla-ekle/yakin-kod')}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text
              style={{
                fontFamily: fontFamily.extrabold,
                fontSize: fontSize.body,
                color: colors.forest,
                textDecorationLine: 'underline',
              }}
            >
              {t.nearbyHaveCode}
            </Text>
          </Pressable>
          <Button
            variant="secondary"
            label={t.nearbyGiveUp}
            onPress={() => {
              resetDraft();
              router.dismissTo('/tarlalarim');
            }}
          />
        </>
      }
    >
      <FlowHeader />
      <Text accessibilityRole="header" style={titleStyle}>
        {t.nearbyHeadline}
      </Text>
      <Text style={subtitleStyle}>{t.nearbyBody}</Text>

      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Text
          style={{ fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.textMuted }}
        >
          {t.nearbySay}
        </Text>
        {code ? (
          <>
            <Text
              testID="yakin-kod"
              style={{
                fontFamily: fontFamily.extrabold,
                fontSize: 28,
                letterSpacing: 4,
                color: colors.forest,
              }}
            >
              {formatCode(code.code)}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.small,
                color: colors.textMuted,
              }}
            >
              {t.nearbyValid}
            </Text>
          </>
        ) : (
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={t.nearbyGet} onPress={() => void getCode()} style={{ minHeight: 48 }} />
          </View>
        )}
      </Card>
      {error ? <Notice tone="warn">{tr.login.noNet}</Notice> : null}
      <Text style={subtitleStyle}>{t.nearbyAfter}</Text>
      <PendingProposals />
    </FlowScreen>
  );
}
