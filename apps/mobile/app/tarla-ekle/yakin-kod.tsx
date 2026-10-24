import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button, colors, fontFamily, radius } from '@tarim/ui';
import {
  FlowHeader,
  FlowScreen,
  Notice,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import { resetDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';

const t = tr.flow;

/** Yakınım yapsın (yardım eden tarafı): yakının verdiği kodu yaz, sonra tarlanın yerini göster. */
export default function EnterCodeScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '');

  return (
    <FlowScreen
      footer={
        <Button
          label={t.next}
          style={[{ minHeight: 48 }, digits.length !== 6 && { opacity: 0.45 }]}
          onPress={
            digits.length === 6
              ? () => {
                  resetDraft({ claimCode: digits });
                  router.replace('/tarla-ekle');
                }
              : undefined
          }
        />
      }
    >
      <FlowHeader />
      <Text accessibilityRole="header" style={titleStyle}>
        {t.nearbyEnterCode}
      </Text>
      <Text style={subtitleStyle}>{t.nearbyCodeLabel}</Text>
      <TextInput
        testID="kod-gir"
        accessibilityLabel={t.nearbyCodeLabel}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^\d ]/g, '').slice(0, 7))}
        keyboardType="number-pad"
        maxLength={7}
        placeholder="000 000"
        style={{
          minHeight: 56,
          borderRadius: radius.row,
          borderWidth: 2,
          borderColor: colors.forest,
          backgroundColor: colors.surface,
          paddingHorizontal: 16,
          fontFamily: fontFamily.extrabold,
          fontSize: 24,
          letterSpacing: 4,
          color: colors.forest,
          textAlign: 'center',
        }}
      />
      {code.length > 0 && digits.length !== 6 ? <Notice>{t.nearbyCodeLabel}</Notice> : null}
    </FlowScreen>
  );
}
