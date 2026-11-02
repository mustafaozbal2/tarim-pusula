// app.json üzerine: Firebase (Android telefon bildirimi, FCM) dosyası varsa derlemeye eklenir.
// EAS derlemesinde dosya ortam değişkeninden (GOOGLE_SERVICES_JSON, dosya türü) gelir; yerelde
// apps/mobile/google-services.json. Dosya repoya girmez (.gitignore).
const { existsSync } = require('node:fs');
const { join } = require('node:path');

module.exports = ({ config }) => {
  const local = join(__dirname, 'google-services.json');
  const file =
    process.env.GOOGLE_SERVICES_JSON || (existsSync(local) ? './google-services.json' : undefined);
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
};
