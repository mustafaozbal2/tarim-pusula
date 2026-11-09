/**
 * Google Play sürümü (EAS "production" profili, EXPO_PUBLIC_PLAY=1): uygulamayı Play günceller.
 * Bu sürümde uygulama içi APK indirip kurma ve site sürüm denetimi (surum.json) çalışmaz, manifestte
 * REQUEST_INSTALL_PACKAGES izni yoktur (plugins/with-play.js). Site APK'sı (preview profili) eskisi gibi kalır.
 */
export const PLAY_SURUMU = process.env['EXPO_PUBLIC_PLAY'] === '1';
