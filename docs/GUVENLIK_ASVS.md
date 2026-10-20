# Güvenlik gözden geçirmesi — OWASP ASVS 4.0 Düzey 2 özeti

Tarih: 2026-10-20 · Kapsam: `apps/api`, `apps/panel`, `packages/device-sim`, cihaz komut yolu. Bu bir **iç gözden geçirmedir**; bağımsız sızma testi veya sertifikasyon değildir.
Durum: **Var** (kodda ve testte), **Kısmi**, **Yok** (bilinen eksik).

| ASVS bölümü | Durum | Dayanak (kod / test) |
|---|---|---|
| V1 Mimari | Kısmi | Varsayılan-kapalı `AccessGuard` (`@Public`, `@Roles`), RLS + sütun yetkisi. Resmi tehdit modeli belgesi yok; docs/PLAN.md + bu tablo yerine geçer. |
| V2 Kimlik doğrulama | Kısmi | SMS-OTP: HMAC özetli kod, deneme sınırı, hız sınırı, süre (g1). Panel: TOTP (RFC 6238 vektörleriyle) + tek kullanımlık adım (g5). **Yok:** TOTP sırrı DB'de düz metin; MFA sıfırlama yok. |
| V3 Oturum | Var | 32 bayt rastgele jeton, DB'de SHA-256 özeti, süre + iptal (`sessions`). Mobilde jeton düz SQLite'ta (**Kısmi**, güvenli depo yok). |
| V4 Erişim denetimi | Var | RLS, `DataService.run` (403 + denetim), "başkası başkasının vanasını açamaz" testleri (g1, g8), il bazlı duyuru izolasyonu (g4, e2e). |
| V5 Girdi doğrulama | Var | Tüm uçlarda zod şemaları (`@tarim/schemas`); künye şeması `strict`; SQL yalnız parametreli; ZIP/PDF boyut sınırları (g12). |
| V6 Kriptografi | Kısmi | `crypto.randomBytes/randomInt`, `timingSafeEqual`, HMAC. Cihaz komut imzası HMAC-SHA256 (device-sim). **Yok:** cihaz sırrı DB'de düz metin (G8/G9 notu); anahtar döndürme yok. |
| V7 Hata/günlük | Var | Zincirli, değiştirilemez `audit_log`; günlükte jeton/OTP değeri yok. |
| V8 Veri koruma | Kısmi | KVKK minimizasyonu: TC kimlik yok, telefon dışında kimlik yok; dışa aktarma + silme (g1, g11 `EXPORT_COVERAGE`). Dinlenme halinde şifreleme dağıtım katmanına bırakıldı. |
| V9 İletişim | Kısmi | Üretimde HSTS (`securityHeaders({hsts})`), Mosquitto TLS yapılandırması (`infra/`) hazır ama canlıda denenmedi. |
| V10 Zararlı kod | Var | Bağımlılıklar yalnız resmi kayıttan; gizli anahtar taraması testi (g14); `.env` izlenmiyor. |
| V11 İş mantığı | Var | Sulama: yetki + TTL + idempotency + ack + 30 dk tavan hem sunucuda hem cihazda; taslak bilgi karar üretmez (kural 1) — testli. |
| V12 Dosya | Kısmi | PDF/docx imza ile tanınır, uzantıya güvenilmez; yükleme sınırı 30 MB gövde; **Yok:** virüs taraması. |
| V13 API | Var | JSON-only; CORS üretimde `CORS_ORIGINS` olmadan başlamaz (g14); güvenlik başlıkları (g14); `x-powered-by` kapalı. Hız sınırı yalnız OTP'de — genel uç sınırı **Yok**. |
| V14 Yapılandırma | Var | Gizli anahtarlar yalnız `.env`; anahtar yoksa sahte sağlayıcı; panelde `next.config.mjs` başlıkları. |

## Bu görevde eklenenler

- `apps/api/src/security.ts`: güvenlik başlıkları ara katmanı, üretimde zorunlu CORS, gizli anahtar tarayıcısı.
- `apps/panel/next.config.mjs`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS, `x-powered-by` kapalı.
- `apps/api/src/g14.test.ts`: depodaki izlenen tüm dosyalarda gizli anahtar taraması (her test çalıştırmasında).

## Bağımlılık taraması (`pnpm audit --prod`, 2026-10-20)

3 bulgu (2 yüksek, 1 orta); **üçü de yalnız mobil derleme aracı zincirindendir** (Expo/Metro: `node-forge`, `braces`, `uuid`). Hiçbiri API sunucusunun, panelin ya da cihaza giden uygulama paketinin çalışma zamanı yolunda değildir; geliştirici makinesi/CI derleme aşamasında çalışır.

| Paket | Önem | Etkilenen | Yama | Karar |
|---|---|---|---|---|
| node-forge ≤ 1.4.0 | yüksek (RSA imza doğrulama) | `@expo/cli` (derleme) | yok | Kabul edildi; güvenilmeyen RSA imzası doğrulanmıyor. Expo güncellemesinde yeniden bak. |
| braces ≤ 3.0.3 | yüksek (DoS) | metro-file-map (derleme) | yok | Kabul edildi; girdi kendi depomuzun dosya adları. |
| uuid < 11.1.1 | orta (arabellek sınırı) | `xcode` eklentisi (derleme) | var | Kabul edildi; Expo yukarı akışı bekleniyor (`overrides` ile zorlamak Expo derlemesini bozabilir, denenmedi). |

Yeniden çalıştırma: kök `pnpm run audit:deps`.

## Açık riskler (öncelik sırasıyla)

1. TOTP sırrı ve cihaz sırrı DB'de düz metin → uygulama katmanı şifrelemesi (KMS anahtarı) gerekir.
2. Mobil jeton güvenli depoda değil (`expo-secure-store`).
3. Genel uç hız sınırı yok (yalnız OTP).
4. Gerçek Postgres/Mosquitto TLS ortamında sızma testi yapılmadı.
