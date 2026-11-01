import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Sunucu sınırı (announcementCreateSchema): data URL en çok 300 000 karakter. */
export const MAX_IMAGE_DATA_URL = 300_000;

export type PhotoResult = { kind: 'ok'; dataUrl: string } | { kind: 'iptal' | 'izin' | 'buyuk' };

/** Tarayıcıda resmi en çok 1280 px'e küçültüp JPEG'e çevirir (sunucu sınırına sığsın). */
async function shrinkOnWeb(uri: string): Promise<string> {
  const img = new (globalThis as unknown as { Image: new () => HTMLImageElement }).Image();
  await new Promise<void>((ok, fail) => {
    img.onload = () => ok();
    img.onerror = () => fail(new Error('resim'));
    img.src = uri;
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.8, 0.6, 0.45, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_IMAGE_DATA_URL) return url;
  }
  return canvas.toDataURL('image/jpeg', 0.2);
}

/** Galeriden fotoğraf seçer; duyuruya eklenecek data URL'yi döner. */
export async function pickPhoto(): Promise<PhotoResult> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { kind: 'izin' };
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    base64: Platform.OS !== 'web',
    // Cihazda yeniden boyutlandırma modülü yok: düşük kaliteyle sıkıştırılır, sığmazsa uyarılır.
    quality: 0.25,
    allowsEditing: Platform.OS !== 'web',
    aspect: [16, 9],
  });
  const a = r.canceled ? undefined : r.assets[0];
  if (!a) return { kind: 'iptal' };
  let dataUrl: string;
  if (Platform.OS === 'web') dataUrl = await shrinkOnWeb(a.uri);
  else {
    if (!a.base64) return { kind: 'iptal' };
    const mime =
      a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    dataUrl = `data:${mime};base64,${a.base64}`;
  }
  return dataUrl.length > MAX_IMAGE_DATA_URL ? { kind: 'buyuk' } : { kind: 'ok', dataUrl };
}
