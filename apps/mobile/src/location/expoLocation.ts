import * as Location from 'expo-location';
import type { LocationProvider } from './gps';

/** expo-location sağlayıcısı (cihazda ve web'de aynı arayüz). */
export const expoLocation: LocationProvider = {
  async requestPermission() {
    const r = await Location.requestForegroundPermissionsAsync();
    return r.status === Location.PermissionStatus.GRANTED ? 'granted' : 'denied';
  },
  async currentPosition() {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy };
  },
};
