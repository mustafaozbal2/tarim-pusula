# Çapraz test bulguları — Tarım Pusula (test eden: ayna-a0, 8 Kasım 2026 ~15:30)

> Yöntem: yalnızca dışarıdan (kara kutu). Tarım Pusula koduna dokunulmadı; kod yalnızca uç adlarını bulmak için okundu.
> Adresler: site `https://tarimpusula.onrender.com` (yalnız statik site + APK) · API `https://tarim-pusula-api.onrender.com`.
> Biçim: no · ekran/uç · adımlar · beklenen · olan · önem.

## Geçenler
| No | Ne denendi | Sonuç |
|---|---|---|
| G1 | Site açılışı, `/surum.json` | 200; `enAz=son=0.3.0`, adres APK'ya işaret ediyor |
| G2 | APK indirme (iki kez tam indirildi) | 85 217 842 bayt, SHA-256 `f92f14b0…bfc4`; repodaki dosya ve site sayfasındaki özetle **birebir aynı**; `Content-Type` doğru |
| G3 | APK içeriği | `com.tarimpusula.app`, versionName 0.3.0 / versionCode 3 (surum.json ile uyumlu) |
| G4 | APK'da Nuvia anahtarı araması (`nvp_…`) | Bulunmadı (C11 maddesi kapandı) |
| G5 | APK'da `AIza…` | Yalnız `resources.arsc` içinde (Firebase istemci anahtarı; B3'te kabul edilmiş) |
| G6 | API `GET /health` | 200 `{"status":"ok"}` |
| G7 | Girişsiz erişim: `/crops`, `/crops/kc-table`, `/library/search`, `/me`, `/fields`, `/panel/summary`, `/admin/audit` | Hepsi 401 "Giriş yapmanız gerekiyor" (yetki kapısı sağlam) |
| G8 | `/places/provinces` | 200, tam **81 il** |
| G9 | `/places/districts?province=Ankara` | 200, ilçe listesi geliyor |
| G10 | SQL kaçış denemesi (`Ankara' OR 1=1--`) | Cloudflare "Blocked" sayfası (WAF), veri sızmadı |
| G11 | Bozuk telefon ile `POST /auth/login` | 400 Türkçe "Geçerli bir cep telefonu numarası yazın" |

## Bulgular
| No | Uç/ekran | Adımlar | Beklenen | Olan | Önem |
|---|---|---|---|---|---|
| CB-1 | `GET /places/districts?province=Ankara` | Listeye bak | "Beypazarı" | "Beypazari" (ASCII i). Başka ilçelerde de benzer Türkçe karakter kaybı olabilir | düşük |
| CB-2 | API yanıt başlıkları | `curl -I /health` | `x-powered-by` gizli; `Strict-Transport-Security`, `X-Content-Type-Options` var | `x-powered-by: Express` açık; HSTS/nosniff yok (Cloudflare yalnız `server` ekliyor) | düşük |
| CB-3 | `POST /auth/login` bozuk JSON | gövde `{bozuk` | Türkçe genel hata | `"Expected property name or '}' in JSON at position 1 (line 1 column 2)"` — İngilizce ayrıştırıcı iç metni | düşük |
| CB-4 | API soğuk başlangıç | Girişsiz uçlara art arda istek | < 1-2 sn | 1,5–8,5 sn (`/panel/summary` 401'i bile 8,5 sn sürdü); Render ücretsiz plan uykusu (C1.7 ile aynı risk) | orta (kullanıcı deneyimi + zamanlayıcılar) |
| CB-5 | CORS | `Origin: https://evil.example` | Yalnız kendi alanların | `access-control-allow-origin: *`. Bearer belirteciyle sorun değil; **çerez** kullanılıyorsa gözden geçir | düşük/bilgi |
| CB-6 | APK izinleri | `aapt2 dump badging` | Yalnız gerekenler | `SYSTEM_ALERT_WINDOW`, `READ/WRITE_CALENDAR`, `RECORD_AUDIO`, `CAMERA` var. `SYSTEM_ALERT_WINDOW` (üstte çizim) özellikle ürkütücü; gerekçe kodda yoksa kaldır | düşük/orta |
| CB-7 | Site mobil görünüm | Edge headless, 420 px | Yatay taşma yok | Görüntüde metin/düğme sağ kenara taşmış göründü; **headless penceresi 500 px'e kilitlenmiş olabilir, doğrulanamadı** — gerçek telefonda bak | doğrulanamadı |

## Denenemeyenler (nedeni)
- **Emülatörde APK 0.3.0** (açılış hızı, geri tuşu, bildirime dokunma, robot sohbeti, arazi ekle niyeti, hava katmanı, haber kartı görselleri): emülatör kilidi `tercih-asistani-7b` tarafında (14:59, 30 dk dolmadan); ayrıca giriş için demo hesap/SMS gerekiyor, bende yok.
- **Yönetici/uzman paneli, haber taraması tetikleme, takvim/erken uyarı demo-gerçek ayrımı:** yönetici/uzman kimlik bilgim yok; canlı veriyi değiştirecek uçlara dokunmadım.
- **Haber görselleri uygun mu:** giriş gerektiriyor, görmedim.
Bunlar için hesap bilgisi (ya da demo hesabı) ve emülatör sırası verilirse devam ederim.
