# Doğrulama Raporu

Üretim tarihi: 2026-10-20 · Sürüm: `dev` dalı, G14 sonu · Ortam: Windows 11, Node 24, pnpm 12, Vitest 5, Playwright (Edge).
Aşağıdaki sayılar bu tarihte çalıştırılan komutların **gerçek çıktısıdır**; elle düzeltilmemiştir. Çıktı kayıtları `.overnight/g14/` altındadır. Sınırlar her bölümün sonunda açıkça yazılıdır.

## 0. Özet — kök `pnpm run verify`

| Paket                               | Test dosyası |                         Test | Sonuç                                                    |
| ----------------------------------- | -----------: | ---------------------------: | -------------------------------------------------------- |
| @tarim/agro-core                    |           12 |                          173 | geçti                                                    |
| @tarim/api                          |           16 |                          264 | geçti                                                    |
| @tarim/mobile                       |           10 |                           90 | geçti                                                    |
| @tarim/device-sim                   |            1 |                           24 | geçti                                                    |
| @tarim/schemas                      |            1 |                           19 | geçti                                                    |
| @tarim/workers                      |            1 |                           11 | geçti                                                    |
| @tarim/ui                           |            1 |                           10 | geçti                                                    |
| @tarim/panel                        |            2 |                            6 | geçti                                                    |
| Playwright e2e (web paketi + panel) |            — |                           19 | 19 geçti (1,6 dk)                                        |
| **Toplam**                          |           44 | **597** (birim/API) + 19 e2e | **27/27 görev yeşil**, lint + typecheck + prettier temiz |

## 1. ET0 (FAO-56 Penman-Monteith) doğrulaması

Kaynak: Allen vd. (1998), FAO Irrigation and Drainage Paper 56, **Örnek 18** (Uccle/Brüksel, 6 Temmuz; Tmin 12,3 / Tmax 21,5 °C; RH 84/63 %; rüzgâr 10 m'de 10 km/sa; güneşlenme 9,25 sa; 100 m; 50,8° K). Test: `packages/agro-core/src/g3.test.ts`.

| Büyüklük          | Kitap | Kodumuzun çıktısı |                Fark |
| ----------------- | ----: | ----------------: | ------------------: |
| ET0 (mm/gün)      |   3,9 |         **3,880** | 0,020 (ölçüt ±0,05) |
| es (kPa)          | 1,997 |            1,9975 |             < 0,001 |
| ea (kPa)          | 1,409 |            1,4086 |             < 0,001 |
| Rs (MJ m⁻² gün⁻¹) | 22,07 |            22,072 |              < 0,01 |
| Rn (MJ m⁻² gün⁻¹) | 13,28 |            13,283 |              < 0,01 |
| Δ (kPa/°C)        | 0,122 |            0,1221 |             < 0,001 |

Ara denklemler ayrıca kitap örnekleriyle sınanır: doygun buhar basıncı Ö.2-3 (e°(24,5)=3,075), basınç (100 m = 100,1 kPa), psikrometrik sabit, rüzgârın 2 m'ye indirilmesi (2,78 → 2,08), Ra Ö.8 (≈32,2), yılın günü (6 Temmuz = 187). Ek: GDD kırpması, 6,5 °C/km yükselti düzeltmesi, Tmax < Tmin hatası, negatif ET0 olmaması.
Su dengesi çekirdeği (`waterBalance.test.ts`, ~30 test) ve don olasılığı (`g3.test.ts`) aynı pakette geçer: agro-core 173/173.
**Sınır:** Yalnız tek basılı örnek (Ö.18) ve ara denklemler. Başka iklimden (ör. Akdeniz/yarı kurak) bağımsız bir ölçüm istasyonuyla (ör. lizimetre ya da MGM istasyon ET0'ı) karşılaştırma YAPILMADI. Su dengesi için kitabın basılı bir günlük dengesiyle birebir doğrulama yapılmadı (G9 notu).

## 2. Pusula AI değerlendirmesi

Küme: `docs/eval/questions.jsonl`, 205 soru; koşucu `apps/api/src/pusula/eval.ts`; tam rapor `docs/eval/last-report.md` (bu görevde yeniden üretildi).
Sağlayıcı: **`test` (belirlenimci SAHTE sağlayıcı)**. Gerçek Claude API'ye çağrı yapılmadı (anahtar yok).

| Kategori                                              |    Soru |          Geçen |       Güvenlik kategorisi        |
| ----------------------------------------------------- | ------: | -------------: | :------------------------------: |
| doz / karışım isteği                                  |      55 |             55 |               evet               |
| prompt enjeksiyonu (doğrudan + kütüphane belgesinden) |      28 |             28 |               evet               |
| yetkisiz (başkasının tarlası)                         |      20 |             20 |               evet               |
| fotoğrafla teşhis                                     |      10 |             10 |               evet               |
| onaysız bilgi                                         |       6 |              6 |               evet               |
| kütüphane atıfı                                       |      30 |             30 |                                  |
| hava / hava (tarlasız)                                |  15 / 4 |         15 / 4 |                                  |
| fiyat / video                                         |   7 / 3 |          7 / 3 |                                  |
| kapsam dışı / uzmana devret                           |  19 / 8 |         19 / 8 |                                  |
| **Toplam**                                            | **205** | **205 (%100)** | güvenlik: tek hata testi düşürür |

**Sınırlar (önemli):** (1) %100, sahte sağlayıcının skorudur; gerçek modelin skoru bilinmiyor. (2) Küme, eşikler ve sahte sağlayıcı aynı geliştirme döngüsünde ayarlandı → aşırı uyum riski; skor yalnız gerileme alarmıdır. (3) Gerçek model için `ANTHROPIC_API_KEY` ile koşucu çalıştırılmalı ve jüri/uzmanın görülmemiş soruları eklenmeli. (4) Olgu doğrulama (kart içindeki her sayı bir araç çıktısına bağlanır) birim testlidir (`pusula.test.ts`).

## 3. Sulama simülatörü — gecikme ve güvenlik

### 3.1 Güvenlik testleri (`packages/device-sim` 24/24, `apps/api/src/g8.test.ts`)

Cihaz tarafı (sanal ESP32): imzalı komutla açılır, süre dolunca kapanır · durdur anında kapatır · 60 dk istense de **30 dk'da** kapanır · tekrar "aç" 30 dk sınırını ileri taşıyamaz · süre 0/negatif reddedilir · aynı komut iki kez gelirse bir kez icra edilir · yanlış imza, alanı değiştirilmiş komut, süresi geçmiş (TTL), başka cihaza imzalı komut, daha yeni komuttan sonra gelen eski komut reddedilir · çöp mesaj cihazı bozmaz · bağlantı kopsa da azami sürede kapanır · elektrik kesilince kapalı başlar.
Aracı: yanlış parola bağlanamaz · cihaz başkasının konusuna abone olamaz/başkası adına ack yayınlayamaz · cihaz komut konusuna yayın yapamaz.
Sunucu: yabancı kullanıcı 403 + denetim satırı, vana açılmaz · yönetici bile başkasının vanasını açamaz · girişsiz 401 · geçersiz cihaz 403 (varlık sızmaz) · idempotency · ikinci "aç" 409, "durdur" her zaman serbest · 31 dk/0/ondalık/süresiz 400 · komut kaydı sonradan değiştirilemez · çevrimdışı cihazda zaman aşımı, geç gelen komutu cihaz da reddeder.

### 3.2 Gecikme (`pnpm --filter @tarim/device-sim bench`, tohum 20261020, 2000 komut)

| Ölçüt                        | Değer   |
| ---------------------------- | ------- |
| Ortalama                     | 477 ms  |
| Ortanca (p50)                | 333 ms  |
| p95                          | 913 ms  |
| p99                          | 3456 ms |
| En büyük                     | 6558 ms |
| TTL (60 sn) içinde onaylanan | %100,00 |

**Sınır:** Ağ gecikmesi MODELDİR (log-normal, ortanca 150 ms/tek yön, %2 olasılıkla +3 s sıçrama), ölçüm değildir. Gerçek ESP32 + GSM/Wi-Fi + gerçek Mosquitto ölçümü donanım gelince aynı biçimle yapılmalıdır. Ayrıntı: `docs/G8_GECIKME.md`.

## 4. Erişilebilirlik denetimi

Otomatik denetim: `apps/mobile/src/g14.test.ts` (kaynak kodu tarar; ihlal testi düşürür).

| Kural (docs/UX_KURALLARI.md)                              | Denetim                                                                                                       | Sonuç      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| Yazı ≥ 16 (sekme etiketi 13 istisna, 60 px alanla telafi) | tüm `fontSize`                                                                                                | ihlal yok  |
| Sistem yazı büyütmesine uyar                              | `allowFontScaling={false}` yok                                                                                | ihlal yok  |
| Dokunma alanı ≥ 56                                        | `minHeight/minWidth` < 56 yok                                                                                 | ihlal yok  |
| Ekran okuyucu                                             | her `Pressable` `accessibilityRole` taşır; yalnız ikonlu düğmelerde (geri, yakınlaştır/uzaklaştır) etiket var | ihlal yok  |
| Emoji yok                                                 | arayüz kaynağında                                                                                             | ihlal yok  |
| Kontrast                                                  | 11 renk çifti WCAG AA ≥ 4,5 (`contrastRatio`)                                                                 | tümü geçti |
| Ses rehberi                                               | Soru sor ekranında sesli okuma (`expo-speech`)                                                                | mevcut     |

Bu görevde yeni ihlal bulunmadı (önceki görevlerde `@tarim/ui` jeton testleri zaten eşikleri koruyordu); denetim artık tüm ekranları kapsıyor.
**Sınır:** Gerçek ekran okuyucuyla (TalkBack/VoiceOver) ve cihaz yazı büyütmesiyle (%200) el testi YAPILMADI; otomatik denetim yalnız kaynak düzeyindedir. Düzen taşması büyük yazıda görsel olarak sınanmadı. Cihazda ses girişi yok (yalnız web).

## 5. Güvenlik ve bağımlılık özeti

Ayrıntı: `docs/GUVENLIK_ASVS.md`. Özet: ASVS L2 iç gözden geçirme (14 bölüm: 8 Var, 6 Kısmi); gizli anahtar taraması izlenen tüm dosyalarda (342+ dosya) **0 bulgu** (`apps/api/src/g14.test.ts`, her test çalıştırmasında); `.env` izlenmiyor; `pnpm audit --prod` 3 bulgu (2 yüksek, 1 orta), hepsi Expo derleme aracı zincirinde, çalışma zamanında yok. Yeni: API/panel güvenlik başlıkları, üretimde zorunlu CORS. Açık riskler: TOTP/cihaz sırrı düz metin, mobil jeton güvenli depoda değil, genel uç hız sınırı yok.

## 6. SUS kullanıcı testi

**Henüz yapılmadı.** Şablon (görevler, anket, puanlama, sonuç tablosu): `docs/SUS_SABLONU.md`. Hedef ≥ 75. Bu bölüme gerçek skor yazılmadan önce en az 8 çiftçiyle test yapılmalıdır; uydurma skor yazılmaz.

| Katılımcı sayısı | Ortalama SUS | Ortanca | En düşük–en yüksek |
| ---------------: | -----------: | ------: | ------------------ |
|                0 |            — |       — | —                  |

## 7. Paketleme ve dağıtım hazırlığı

- Mobil: `apps/mobile/eas.json` (development / preview / production; Android app-bundle), `app.json` (paket kimlikleri `tr.tarimpusula.app`, izin metinleri, istenmeyen izinler engelli). `expo export --platform web` bu görevde yeniden çalıştırıldı ve başarılı. **EAS derlemesi çalıştırılmadı** (Expo hesabı/imzalama anahtarı yok); API adresleri `*.example.invalid` yer tutucudur.
- PWA: `public/manifest.webmanifest`, 192/512 simge, `public/index.html` (tr, tema rengi), `public/sw.js` (kabuk çevrimdışı; API önbelleğe alınmaz). Tarayıcıda "ana ekrana ekle" ve gerçek çevrimdışı açılış el ile denenmedi; Lighthouse PWA denetimi yapılmadı. Simgeler geçici (düz renk + elmas), markalı tasarım gerekir.
- Gizlilik politikası TASLAĞI: `docs/GIZLILIK_POLITIKASI.md` (hukuki gözden geçirme gerekir; KVKK aydınlatma metni ayrıdır).

## 8. Bilinen açıklar (dürüstlük listesi)

1. Gerçek Claude, gerçek Copernicus, gerçek hal/borsa servisleri, gerçek SMS, gerçek Expo Push, gerçek MQTT/TLS ve gerçek Postgres+PostGIS+pgvector ile canlı çalıştırma yapılmadı; testler taklit/PGlite ile.
2. Tohum Kc, don eşikleri, uygunluk faktörleri, destekler ve NDVI eşikleri uzman onayı bekliyor; canlıda karar/uyarı üretmezler (kural 1).
3. Cihaz (iOS/Android) üzerinde ekran denenmedi; tarayıcı yalnız Edge.
4. SUS testi yapılmadı; ET0 yalnız kitap örneğiyle doğrulandı.
