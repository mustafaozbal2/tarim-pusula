import { useState } from 'react';
import { Image, type ImageStyle, StyleSheet, Text, View, type StyleProp } from 'react-native';
import { colors, fontFamily, fontSize } from '@tarim/ui';
import { IMAGE_FILES, type ImageName } from '../assets';

/**
 * images/ klasöründeki görsel yuvası. Dosya "Resim N" yer tutucusuysa o görünür; Mustafa aynı adlı
 * dosyayı üzerine yazınca gerçek görsel görünür, kod değişmez. Yüklenemezse "Resim" kutusu çizilir.
 */
export function ImageSlot({
  name,
  style,
  label,
  testID,
  uri,
}: {
  name: ImageName;
  style?: StyleProp<ImageStyle>;
  /** Ekran okuyucu metni. */
  label: string;
  testID?: string;
  /** Verilirse (ör. duyuru görseli) dosya yerine bu görsel kullanılır. */
  uri?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={label}
        testID={testID}
        style={[styles.box, style as object]}
      >
        <Text style={styles.text}>Resim</Text>
      </View>
    );
  }
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
      source={uri ? { uri } : (IMAGE_FILES[name] as number)}
      resizeMode="cover"
      onError={() => setFailed(true)}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#D6DADC', alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fontFamily.bold, fontSize: fontSize.small, color: colors.textMuted },
});
