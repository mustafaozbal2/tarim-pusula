# Cihaz entegrasyonu — araştırma notu (G21)

Durum: **bu turda çevrimiçi sayfalar açılıp okunmadı.** Aşağıdaki bağlantılar kaynak gösterimidir; lisans/ücret/kota koşulları için "doğrulanamadı" yazan her yerde karar verilmeden önce sayfa okunmalıdır. Uydurma uç nokta yazılmadı; gerçek üretici bağlantıları yalnız arayüz + sahte sağlayıcıdır (`packages/devices`, `REAL_CLOUDS` boş).

## Mimari

`packages/devices`: `DeviceAdapter` arayüzü. Bağlantı yöntemleri:

| Yöntem | Gerçekleme | Gizli anahtar |
|---|---|---|
| Eşleştirme kodu / QR (kendi ESP32, MQTT) | `PairingCodeAdapter` | cihaz sırrı sunucuda şifreli (AES-256-GCM) |
| Üretici bulutu (OAuth/anahtar) | `ManufacturerCloud` arayüzü + `FakeManufacturerCloud` ("örnek" etiketli) | yalnız sunucu `.env`; yoksa sahte sağlayıcı |
| CSV / elle giriş | `csv.ts`, `validate.ts` | yok |

Her cihaz için üretici, model, kaynak, eklenme tarihi ve adaptör sürümü saklanır. Cihaz ekleme sahiplik doğrular; sulama komutu kuralları (yetki, TTL, idempotency, ack, 30 dk, audit) değişmedi.

## Üretici / protokol / lisans tablosu

| Tür | Aday | Protokol | Kaynak | Lisans / erişim |
|---|---|---|---|---|
| Sulama kontrol | Kendi ESP32 | MQTT 3.1.1/5 | https://mqtt.org/specification | Açık standart; kendi cihazımız |
| Toprak nem sensörü | Pessl Metos / FieldClimate | REST API | https://api.fieldclimate.com/v2/docs | doğrulanamadı (hesap + API anahtarı gerekir; ticari koşullar okunmadı) |
| Hava istasyonu | Davis WeatherLink | REST API v2 | https://weatherlink.com/docs | doğrulanamadı (anahtar/sır çifti gerekir; kota okunmadı) |
| Drone | DJI | Cloud API / SDK | https://developer.dji.com | doğrulanamadı (geliştirici onayı gerekir) |
| Pülverizatör / makine | John Deere Operations Center | OAuth 2.0 REST | https://developer.deere.com | doğrulanamadı (sözleşme/onay gerekir) |
| Diğer | CSV içe aktarma | dosya | — | Lisans sorunu yok; kullanıcı kendi verisi |

Karar: sözleşme/izin gerektiren üreticiler için yalnız arayüz ve sahte sağlayıcı. İzin alınınca `REAL_CLOUDS` listesine adaptör eklenir; anahtar `.env`'de, repoda değil.

## Veri kaynağı kaydı

Her ölçüm `source` + zaman + adaptör sürümüyle saklanır; sahte sağlayıcı ölçümleri "ÖRNEK" etiketiyle gösterilir ve karar üretmez.
