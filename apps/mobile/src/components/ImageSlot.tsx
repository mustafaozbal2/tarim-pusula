import { useState } from 'react';
import { Image, type ImageStyle, StyleSheet, View, type StyleProp } from 'react-native';
import { IMAGE_FILES, type ImageName } from '../assets';

/**
 * images/ klasöründeki görsel yuvası. Verilen görsel (`uri`) açılmazsa yuvanın dosyası, o da açılmazsa
 * yazısız nötr kutu görünür: ekranda hiçbir zaman "fotoğraf yok" ya da "Resim" yazısı çıkmaz (G22.4).
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
  // 0: uri (varsa), 1: yuva dosyası, 2: nötr kutu
  const [stage, setStage] = useState(uri ? 0 : 1);
  const file = IMAGE_FILES[name] as number | undefined;
  if (stage >= 2 || (stage === 1 && file === undefined)) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={label}
        testID={testID}
        style={[styles.box, style as object]}
      />
    );
  }
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
      source={stage === 0 && uri ? { uri } : (file as number)}
      resizeMode="cover"
      onError={() => setStage((s) => s + 1)}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#CFE3DF' },
});
