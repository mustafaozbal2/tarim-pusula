/* eslint-disable */
// Google Play sürümü (EXPO_PUBLIC_PLAY=1): Play'in yasakladığı/izin istediği öğeler manifestten çıkarılır.
//  - REQUEST_INSTALL_PACKAGES: uygulama içi APK kurma yok (güncellemeyi Play yapar).
//  - SYSTEM_ALERT_WINDOW: kullanılmaz (app.json blockedPermissions ile de engelli).
//  - usesCleartextTraffic: yalnız https (üretim API'si https).
// Site APK'sı (preview profili) bu eklentiden etkilenmez.
const { withAndroidManifest } = require('expo/config-plugins');

const KALDIR = [
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.SYSTEM_ALERT_WINDOW',
  // Android 13+ fotoğraf seçici ve uygulama önbelleği geniş depolama izni gerektirmez.
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = function withPlay(config) {
  if (process.env.EXPO_PUBLIC_PLAY !== '1') return config;
  return withAndroidManifest(config, (cfg) => {
    const m = cfg.modResults.manifest;
    m.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    m['uses-permission'] = (m['uses-permission'] ?? []).filter(
      (p) => !KALDIR.includes(p.$['android:name']),
    );
    for (const ad of KALDIR)
      m['uses-permission'].push({ $: { 'android:name': ad, 'tools:node': 'remove' } });
    const app = m.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'false';
    return cfg;
  });
};
