/* eslint-disable */
// Android 9+ varsayılan olarak http:// trafiğini engeller. Demo sunucusu yerel ağda http ile çalıştığından
// manifest'e usesCleartextTraffic=true yazılır. Üretimde https kullanılınca bu eklenti app.json'dan çıkarılır.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartext(config) {
  if (process.env.EXPO_PUBLIC_PLAY === '1') return config; // Play sürümü: with-play.js https zorlar
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
