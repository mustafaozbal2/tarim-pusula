import { Platform } from 'react-native';
import type { Api } from './api/client';

/**
 * Bildirim iznini ister ve cihaz belirtecini sunucuya kaydeder. Web'de ve izin verilmezse sessizce atlanır;
 * hata uygulamayı bozmaz. Android'de don için yüksek öncelikli kanal açılır.
 */
export async function registerForPush(api: Pick<Api, 'registerPush'>): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const N = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('don', {
        name: 'Don uyarısı',
        importance: N.AndroidImportance.MAX,
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return false;
    const { data } = await N.getExpoPushTokenAsync();
    await api.registerPush(data, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch {
    return false;
  }
}
