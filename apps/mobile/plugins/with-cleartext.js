/* eslint-disable */
// Android 9+ varsayılan olarak http:// trafiğini engeller. Demo sunucusu yerel ağda http ile çalıştığından
// manifest'e usesCleartextTraffic=true yazılır. Üretimde https kullanılınca bu eklenti app.json'dan çıkarılır.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartext(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return cfg;
  });
};
