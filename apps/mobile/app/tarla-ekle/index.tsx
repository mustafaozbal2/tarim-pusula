import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { colors, fontFamily, fontSize } from '@tarim/ui';
import {
  ChoiceRow,
  FlowHeader,
  FlowScreen,
  subtitleStyle,
  titleStyle,
} from '../../src/components/FlowParts';
import { useDraft } from '../../src/flow/store';
import { tr } from '../../src/i18n/tr';

const t = tr.flow;

/** Konum: dört yol. (Yakının tarla eklerken "Yakınım yapsın" seçeneği gizlenir.) */
export default function WhereScreen() {
  const router = useRouter();
  const draft = useDraft();
  const helping = !!draft.claimCode;
  return (
    <FlowScreen
      footer={
        <Text
          style={{
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.small,
            color: colors.textMuted,
          }}
        >
          {t.changeLater}
        </Text>
      }
    >
      <FlowHeader step={t.step1} />
      <Text accessibilityRole="header" style={titleStyle}>
        {helping ? t.whereHelper : t.where}
      </Text>
      <Text style={subtitleStyle}>{t.whereHint}</Text>
      <ChoiceRow
        testID="yol-gps"
        tone="primary"
        icon="target"
        title={t.gps.title}
        hint={t.gps.hint}
        onPress={() => router.push('/tarla-ekle/gps')}
      />
      <ChoiceRow
        testID="yol-koy"
        tone="outline"
        icon="village"
        title={t.village.title}
        hint={t.village.hint}
        onPress={() => router.push('/tarla-ekle/koy')}
      />
      <ChoiceRow
        testID="yol-harita"
        tone="outline"
        icon="map"
        title={t.map.title}
        hint={t.map.hint}
        onPress={() => router.push('/tarla-ekle/harita')}
      />
      {helping ? null : (
        <ChoiceRow
          testID="yol-yakin"
          tone="soft"
          icon="people"
          title={t.nearby.title}
          hint={t.nearby.hint}
          onPress={() => router.push('/tarla-ekle/yakin')}
        />
      )}
    </FlowScreen>
  );
}
