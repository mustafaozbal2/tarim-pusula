import { Platform } from 'react-native';

/** Cihaz bildirimi gönderir; web'de ya da izin yoksa sessizce hiçbir şey yapmaz. */
export async function notifyNow(n: { title: string; body: string }): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const N = await import('expo-notifications');
    const perm = await N.getPermissionsAsync();
    if (!perm.granted) return;
    await N.scheduleNotificationAsync({
      content: { title: n.title, body: n.body },
      trigger: null,
    });
  } catch {
    // Bildirim verilemese de karar ekranda görünür.
  }
}
