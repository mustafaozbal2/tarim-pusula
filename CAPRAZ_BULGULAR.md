# Çapraz test bulguları — Tarım Pusula (test eden: ayna-a0, 8 Kasım 2026 ~15:30)

> Yöntem: yalnızca dışarıdan (kara kutu). Tarım Pusula koduna dokunulmadı; kod yalnızca uç adlarını bulmak için okundu.
> Adresler: site `https://tarimpusula.onrender.com` (yalnız statik site + APK) · API `https://tarim-pusula-api.onrender.com`.
> Biçim: no · ekran/uç · adımlar · beklenen · olan · önem.

## Geçenler

| No  | Ne denendi                                                                                                          | Sonuç                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| G1  | Site açılışı, `/surum.json`                                                                                         | 200; `enAz=son=0.3.0`, adres APK'ya işaret ediyor                                                                           |
| G2  | APK indirme (iki kez tam indirildi)                                                                                 | 85 217 842 bayt, SHA-256 `f92f14b0…bfc4`; repodaki dosya ve site sayfasındaki özetle **birebir aynı**; `Content-Type` doğru |
| G3  | APK içeriği                                                                                                         | `com.tarimpusula.app`, versionName 0.3.0 / versionCode 3 (surum.json ile uyumlu)                                            |
| G4  | APK'da Nuvia anahtarı araması (`nvp_…`)                                                                             | Bulunmadı (C11 maddesi kapandı)                                                                                             |
| G5  | APK'da `AIza…`                                                                                                      | Yalnız `resources.arsc` içinde (Firebase istemci anahtarı; B3'te kabul edilmiş)                                             |
| G6  | API `GET /health`                                                                                                   | 200 `{"status":"ok"}`                                                                                                       |
| G7  | Girişsiz erişim: `/crops`, `/crops/kc-table`, `/library/search`, `/me`, `/fields`, `/panel/summary`, `/admin/audit` | Hepsi 401 "Giriş yapmanız gerekiyor" (yetki kapısı sağlam)                                                                  |
| G8  | `/places/provinces`                                                                                                 | 200, tam **81 il**                                                                                                          |
| G9  | `/places/districts?province=Ankara`                                                                                 | 200, ilçe listesi geliyor                                                                                                   |
| G10 | SQL kaçış denemesi (`Ankara' OR 1=1--`)                                                                             | Cloudflare "Blocked" sayfası (WAF), veri sızmadı                                                                            |
| G11 | Bozuk telefon ile `POST /auth/login`                                                                                | 400 Türkçe "Geçerli bir cep telefonu numarası yazın"                                                                        |

## Bulgular

| No   | Uç/ekran                                | Adımlar                        | Beklenen                                                                        | Olan                                                                                                                                                           | Önem                                       |
| ---- | --------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| CB-1 | `GET /places/districts?province=Ankara` | Listeye bak                    | "Beypazarı"                                                                     | "Beypazari" (ASCII i). Başka ilçelerde de benzer Türkçe karakter kaybı olabilir                                                                                | düşük                                      |
| CB-2 | API yanıt başlıkları                    | `curl -I /health`              | `x-powered-by` gizli; `Strict-Transport-Security`, `X-Content-Type-Options` var | `x-powered-by: Express` açık; HSTS/nosniff yok (Cloudflare yalnız `server` ekliyor)                                                                            | düşük                                      |
| CB-3 | `POST /auth/login` bozuk JSON           | gövde `{bozuk`                 | Türkçe genel hata                                                               | `"Expected property name or '}' in JSON at position 1 (line 1 column 2)"` — İngilizce ayrıştırıcı iç metni                                                     | düşük                                      |
| CB-4 | API soğuk başlangıç                     | Girişsiz uçlara art arda istek | < 1-2 sn                                                                        | 1,5–8,5 sn (`/panel/summary` 401'i bile 8,5 sn sürdü); Render ücretsiz plan uykusu (C1.7 ile aynı risk)                                                        | orta (kullanıcı deneyimi + zamanlayıcılar) |
| CB-5 | CORS                                    | `Origin: https://evil.example` | Yalnız kendi alanların                                                          | `access-control-allow-origin: *`. Bearer belirteciyle sorun değil; **çerez** kullanılıyorsa gözden geçir                                                       | düşük/bilgi                                |
| CB-6 | APK izinleri                            | `aapt2 dump badging`           | Yalnız gerekenler                                                               | `SYSTEM_ALERT_WINDOW`, `READ/WRITE_CALENDAR`, `RECORD_AUDIO`, `CAMERA` var. `SYSTEM_ALERT_WINDOW` (üstte çizim) özellikle ürkütücü; gerekçe kodda yoksa kaldır | düşük/orta                                 |
| CB-7 | Site mobil görünüm                      | Edge headless, 420 px          | Yatay taşma yok                                                                 | Görüntüde metin/düğme sağ kenara taşmış göründü; **headless penceresi 500 px'e kilitlenmiş olabilir, doğrulanamadı** — gerçek telefonda bak                    | doğrulanamadı                              |

## Denenemeyenler (nedeni)

- **Emülatörde APK 0.3.0** (açılış hızı, geri tuşu, bildirime dokunma, robot sohbeti, arazi ekle niyeti, hava katmanı, haber kartı görselleri): emülatör kilidi `tercih-asistani-7b` tarafında (14:59, 30 dk dolmadan); ayrıca giriş için demo hesap/SMS gerekiyor, bende yok.
- **Yönetici/uzman paneli, haber taraması tetikleme, takvim/erken uyarı demo-gerçek ayrımı:** yönetici/uzman kimlik bilgim yok; canlı veriyi değiştirecek uçlara dokunmadım.
- **Haber görselleri uygun mu:** giriş gerektiriyor, görmedim.
  Bunlar için hesap bilgisi (ya da demo hesabı) ve emülatör sırası verilirse devam ederim.

## 2. tur — yerel demo ile girişli ekranlar (ayna-a0, 9 Kasım 2026)

Yöntem: `pnpm run demo` (yerel, sahte veri; canlıya dokunulmadı), Playwright ile 390×844 mobil web, demo hesabı +905320000001 / `Tarla2026`.
**Not (TP-6):** ilk demo derlemesi eski kaldı (robot düğmesi `asistan-ac` yoktu, giriş SMS koduydu); `pnpm run demo -- --rebuild` sonrası güncel kodla denendi.

### Geçenler

| No  | Ne denendi                                                   | Sonuç                                                                                                         |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| G12 | Haber/duyuru şeridi görselleri (örnek verideki 5 kart)       | Konuyla uyumlu görseller: yeşil buğday, traktör, toprak/gübre, çiftçi, tarla; metinler kırpılıyor ama okunur  |
| G13 | Bildirimler (`/bildirimler`)                                 | Liste doluyor, "Yeni" rozetleri, geri tuşu ana sayfaya dönüyor                                                |
| G14 | Hava (`/hava`)                                               | Doldu: anlık, 5 günlük tahmin, don olasılığı %0 ("tahmindir", kaynak Open-Meteo CC BY 4.0), referans su kaybı |
| G15 | Takvim (`/takvim`)                                           | Ay takvimi, "Şimdi / Yaklaşan" işler, kaynak ve "Neden?", telefon takvimine ekle/.ics paylaş görünüyor        |
| G16 | İlaç dozu sorusu ("İlaç dozu ne kadar olmalı?")              | Doz verilmiyor; etiket/ziraat mühendisi/BKÜ'ye yönlendirme (kural 2 doğru)                                    |
| G17 | Robot asistan (`asistan-ac`): "yeni tarla eklemek istiyorum" | Sohbet içinde kalıyor, sayfa değişmiyor; "Arazini ekleyelim. Şu an arazinde misin?" + Evet/Hayır              |
| G18 | Açılış hızı (demo, localhost)                                | ~1,4 sn ağ boşta; konsol/sayfa hatası yok (yalnız girişten önce `/fields` 401)                                |
| G19 | Canlı CB-2 (güvenlik başlıkları)                             | DÜZELDİ: HSTS, nosniff, X-Frame-Options, Referrer-Policy var; `x-powered-by` yok                              |
| G20 | Canlı CB-3 (bozuk JSON)                                      | DÜZELDİ: "İstek gövdesi geçerli JSON değil."                                                                  |

### Bulgular

| No             | Ekran/uç                                                                                                                       | Olan                                                                                                                                                                                                   | Önem                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| TP-1           | Soru sor ekranı → "Yazarak sor" → "tarla eklemek istiyorum" (ESKİ demo derlemesinde denendi, yeni derlemede yeniden denenmedi) | "Güvenilir bir kaynak bulamadım. Sorunu uzmana ilettim." — niyet yakalanmadı, gereksiz soru uzman kuyruğuna gitti. Robot panelinde doğru çalışıyor; Soru sor ekranında da aynı niyet yakalayıcı olmalı | orta (yeni derlemede doğrulanmalı) |
| TP-2           | Robot sohbeti                                                                                                                  | Karşılama cümlesi "Hoş geldiniz efendim!" — Jarvis/Nuvia üslubu; çiftçi uygulamasında "efendim" ürün kararı olmalı                                                                                     | düşük                              |
| TP-3           | Robot, tarla ekleme akışı ortadayken alakasız soru ("Zeytin ne zaman budanır?")                                                | Cevap yerine "Arazinde misin, değil misin? Evet ya da hayır yazabilirsin." tekrarı; akıştan çıkış/"vazgeç" seçeneği görünmedi                                                                          | orta                               |
| TP-4           | Ayarlar → Hakkında                                                                                                             | "Sürüm 0.0.0" (eski demo derlemesinde; yeni derlemede kontrol edilmedi)                                                                                                                                | düşük                              |
| TP-5           | `docs/DEMO_REHBERI.md`                                                                                                         | Giriş "Demo kodu 123456" diyor; güncel kod rol seçimi + telefon + şifre (`Tarla2026`). Rehber eski                                                                                                     | düşük                              |
| TP-6           | `pnpm run demo`                                                                                                                | Önceden derlenmiş mobil paketi güncel kaynağı yansıtmıyor (robot yoktu); `--rebuild` gerekti. Demo kapanınca kendiliğinden çıkış yaptı, ikinci başlatmada sorun yok                                    | düşük                              |
| CB-4 (yeniden) | Canlı API                                                                                                                      | 0,6–2,9 sn (öncekinden iyi; hâlâ dalgalı, Render uykusu riski sürüyor)                                                                                                                                 | düşük                              |
| CB-6 (yeniden) | Yayındaki APK 0.3.0                                                                                                            | `SYSTEM_ALERT_WINDOW` hâlâ var — düzeltme (b5175dc) yeni APK'da; yayındaki APK değişmedi                                                                                                               | AÇIK (yeni APK bekliyor)           |

### Denenemeyenler

- Takvimin "Bu hafta için önemli bir iş yok" boş durumu: demo verisinde iş var, tetiklenemedi.
- Emülatörde APK, gerçek bildirime dokunma (push), gerçek GPS/konum izni, sesli sorma: emülatör kilidi/APK demo sunucusuna yönlendirilemediği için web ile sınırlı kaldım.
- Yönetici/uzman paneli (8201) yalnız ayakta olduğu doğrulandı (200), gezilmedi.
