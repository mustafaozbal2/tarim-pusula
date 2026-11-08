# Tarım Pusula — Test Raporu (8 Kasım 2026, sürüm 0.2.0)

Durum anahtarı: **GEÇTİ** (otomatik test ya da gerçek Nuvia'ya yerel istekle denendi) · **HATA** (hata bulundu; düzeltildi ya da açık) · **DENENMEDİ** (telefonda/canlıda elle denenmesi gerek).
Canlı: Render API commit 35c36cf, site/APK 0.2.0, OTA gönderildi. `pnpm run verify` 30/30 yeşil (lint, tip, birim, e2e 61 test).

## A. Denenen ve geçen

| # | Ne yapıldı | Beklenen | Durum |
|---|---|---|---|
| A1 | Nuvia `soru_cevapla` (yerel, gerçek Nuvia): "Zeytin yapraklarında sarı leke" | Genel nedenler + uzmana yönlendirme, ~5 sn | GEÇTİ |
| A2 | Aynı işlev, "litreye kaç ml ilaç" | Doz verilmez, etikete/mühendise yönlendirir | GEÇTİ |
| A3 | `haber_analiz` gerçek Nuvia: kiraz fidanı desteği duyurusu | JSON: ilgili=true, ürün elma-kiraz-armut, kategori yonlendirme; metinde olmayan bilgi yok | GEÇTİ |
| A4 | `robot_sohbet` ("tarla eklemek istiyorum") | `{cevap, yonlendir}`, ~1,6 sn | GEÇTİ (not: cevap "ayarlar bölümüne gir" dedi; sohbet içi tarla ekleme motoru ayrı, bkz. C5) |
| A5 | `/v1/proje/ses` | audio/wav, RIFF başlığı, 236 KB, ~3,8 sn | GEÇTİ |
| A6 | `foto_analiz` 1x1 PNG ile | Çalışır; görüntü anlamsızsa dürüst "göremiyorum" | GEÇTİ (gerçek yaprak fotoğrafıyla DENENMEDİ, bkz. C3) |
| A7 | Doz içeren cevabın atılması, şema dışı/HTTP hatası/ağ hatası → null | Kural 2; sistem çökmez | GEÇTİ (birim) |
| A8 | Geçit başlığı `x-nuvia-proje`, 429/502'de 1 yeniden deneme | Sözleşme uyumu | GEÇTİ (birim) |
| A9 | Uzman beklemesi (birim, sahte Nuvia): 12 saati geçen soruya geçici cevap, yeni/cevaplanmış soruya dokunmaz, ikinci tur tekrar yazmaz, Nuvia null ise 6 saat tekrar denemez | Bkz. Uzmana sor | GEÇTİ |
| A10 | Tarama (birim, sahte kaynak): Haber/Duyuru bağlantı ayıklama, robots.txt, ilk taramada en yeni 3, tekrar eklememe, il/ilçe/ürün hedefleme, taslak+auto işareti | Bkz. Tarama | GEÇTİ (10 test) |
| A11 | 7 günlük don (birim): onaylı eşik yoksa olasılık yok, en erken uyarı günü, buzlanma bayrağı | Kural 1 | GEÇTİ (7 test) |
| A12 | Robot sohbeti motoru (birim, 24 test): tarla ekleme (GPS / il-ilçe-köy), bilinmeyen il/ilçe/ürün tekrar sorulur, çevrimdışı sıraya alma, hava/takvim, Pusula sorusu + video/kaynak + yapay zekâ uyarısı, "Uzmana da sor" | Bkz. Robot | GEÇTİ |
| A13 | Canlı: Nuvia sayacı 12 → 252 (HABER_TARAMA=1 sonrası) | Tarama zinciri Nuvia'yı çağırıyor | GEÇTİ (çağrı sayısı doğrulandı; kartların içeriği C1) |
| A14 | e2e (tarayıcı): giriş, ana sayfa, Erken Uyarılar, hava, takvim, asistan paneli açılıp "tarla ekle" sohbet içinde kalıyor | Sayfa değişmez | GEÇTİ |

## B. Bulunan hatalar

| # | Hata | Çözüm | Durum |
|---|---|---|---|
| B1 | Tasarruf raporu "bugün"ü UTC hesaplıyordu; hava günleri TSİ → 00:00–03:00 arası gün kayıyor, g21 testi saate bağlı kırılıyordu ("29 yerine 30") | `trDate` (UTC+3) | DÜZELTİLDİ |
| B2 | Ana sayfada don uyarı satırı tarihi UTC idi; gece yarısından sonra dünün tarihiyle listenin altına düşüyordu (e2e kırıldı) | Yerel gün | DÜZELTİLDİ |
| B3 | g14 gizli anahtar taraması APK'da `AIza…` buldu | Firebase istemci anahtarı (her APK'da gömülü, gizli değil; resources.arsc'ta proje numarası yanında). APK taramadan çıkarıldı, kaynaklar taranıyor. KARARLAR'da | KAPATILDI |
| B4 | `kurum-ornek.test.ts` regex'inde gerçek geri-silme karakteri (lint) | `\b` | DÜZELTİLDİ |
| B5 | Lint: kullanılmayan değişkenler, `any` (robot.test.ts, ortam.ts, sohbet.ts, Asistan.tsx) | Temizlendi | DÜZELTİLDİ |
| B6 | Bakanlık ana sitesi robots.txt `Disallow: *` | Taranmaz (kural 6). İl müdürlükleri (81 adres, CSV) taranır | KARAR |
| B7 | Fotoğraf: Nuvia'nın 1x1 görselle verdiği cevap "fotoğraf ulaşmadı" dedi | Küçük sahte görsel; gerçek fotoğrafla yeniden denenmeli | AÇIK (C3) |

## C. Denenemeyen / emin olunamayan (telefonda ya da canlıda denenecek)

### C1. Tarama zinciri uçtan uca (kaynak çek → Nuvia → haber kartı → uzman onayı)
Beklenen akış: günde 5 kez `HABER_TARAMA=1` ile otomatik; elle: yönetici `POST /admin/jobs/haber-tara`.
1. **Hangi kaynaklar açılıyor/engelleniyor/boş:** DENENMEDİ canlıda. 81 il müdürlüğü adresi yalnız bağlantı yoklamasıyla doğrulandı; ayıklayıcı genel HTML varsayımı kullanıyor, bazı siteler (JavaScript ile yüklenen, farklı yol adları, https hatası) boş dönebilir. Yapılacak: yönetici ucundan tarama çalıştır, yanıttaki kaynak başına sayıları (bulunan/yeni/atlanan/robots engeli/hata) kaydet; boş kalan siteleri listele. Beklenen: çoğu kaynak ≥1 bağlantı verir; robots engelli olanlar "atlandı" olarak işaretlenir.
2. **İlk tarama:** kaynak başına en yeni 3 duyuru alınır; ikinci taramada aynı duyuru tekrar gelmez (scan_seen + source_url benzersiz). Beklenen: ikinci çalıştırmada "yeni: 0". DENENMEDİ canlıda.
3. **Nuvia analizi:** `istek_bu_ay` artışı (12→252) çağrıların gittiğini gösteriyor; ürün/kategori sonuçlarının doğruluğu ve "ilgili=false" ayıklaması canlı verilerle DENENMEDİ. Hatalı/boş Nuvia cevabında kural analizine düştüğü birimde GEÇTİ.
4. **Haber kartı:** `taslak-uzman-onayi-bekliyor`, `auto=true`, "otomatik alındı" notu, "Kaynağı aç" bağlantısı, görsel (varsa), bildirim YOK. Yalnız eşleşen il/ilçe/ürün çiftçisine görünür. Telefonda: Haberler sayfası + ana sayfa şeridi; farklı ilden bir hesapla görünmemeli. DENENMEDİ.
5. **Uzman onayı:** panelden onaylanınca otomatik not kalkar mı, yayın durumu değişir mi? DENENMEDİ (panel akışı).
6. **Resmî kaynaklar sayfası** (Ayarlar → Resmî kaynaklar): liste, il filtresi, bağlantılar açılıyor mu. DENENMEDİ.
7. Render ücretsiz plan uykuda: zamanlayıcılar uyurken çalışmaz; tarama yalnız API uyanıkken döner (UptimeRobot hâlâ kurulu değil). Beklenen risk: günde 5 tarama garanti değil.

### C2. Uzmana sor
1. Soru gönder (metin) → "Uzmana gitti" durumu, Sorularım listesinde "bekliyor". DENENMEDİ telefonda.
2. 12 saat sonra geçici Nuvia cevabı: sorunun altında "yapay zekâ geçici cevabı" + uyarı ("…Tüm risk size aittir…"), durum hâlâ "bekliyor". Hızlı deneme: sunucuda `NUVIA_BEKLEME_SAAT=0` (yerel) ve `NUVIA_BEKLEME_TARAMA_DK` kısa. Canlıda DENENMEDİ.
3. Uzman cevaplayınca: uzman cevabı esas olur, yapay zekâ cevabı geride kalır/etiketli. Mantık (`WHERE status='bekliyor'`) var; ekranda görünümü DENENMEDİ.
4. Doz soran soruya geçici cevap: doz yok, etikete yönlendirme. Nuvia tarafı GEÇTİ (A2); uygulamada görünümü DENENMEDİ.
5. Bildirim: cevap gelince çiftçiye bildirim gidiyor mu? DENENMEDİ.

### C3. Fotoğraflı soru
1. Telefonda galeri/kamera → soru + fotoğraf gönder. Beklenen: fotoğraf sunucuya gider, 12 saat sonra `foto_analiz` ile gerçek görüntü Nuvia'ya gönderilir. DENENMEDİ.
2. Gerçek yaprak fotoğrafıyla Nuvia'nın cevabı (uydurma teşhis/ilaç var mı) DENENMEDİ.
3. Fotoğraf boyutu sınırı/sıkıştırma (büyük fotoğraf zaman aşımı yapar mı) DENENMEDİ. Not: gövde base64 olarak ~%33 büyür.

### C4. Robot — karşılama ve kart
1. Uygulamayı aç → robot 5–10 sn "karşılama balonu" gösterir, kaybolur. DENENMEDİ telefonda (e2e web'de var).
2. Robota dokun → küçük sohbet kartı (sayfa değişmez); kartı genişlet. DENENMEDİ telefonda.
3. Yazma sırasında "düşünüyor" göstergesi; yavaş ağda takılma yok. Kod var (`busy`), DENENMEDİ.

### C5. Robot — tarla ekleme sohbet içinde
1. "Tarla ekle" → "Şu an arazinde misin?" → Evet: konum izni → GPS → ürün → ad (ya da "otomatik") → sessiz kayıt, yeni arazi seçili olur. Mantık birimde GEÇTİ; gerçek konum izni/GPS DENENMEDİ.
2. Hayır: il → ilçe → köy → ürün → ad. GEÇTİ (birim); gerçek il/ilçe/köy listeleriyle (köy sayısı çok, arama) DENENMEDİ.
3. İnternet yokken: "İnternet gelince kaydedeceğim" (kuyruk). DENENMEDİ.
4. Ada/parsel isteğe bağlı (Arazi ekle / düzenle ekranı): boş geçilebilir, girilince kaydedilir. Birim GEÇTİ, ekranda DENENMEDİ.
5. Not: Nuvia `robot_sohbet` "ayarlardan ekle" gibi yönlendirebilir; sohbet motoru tarla ekleme niyetini önce yerelde yakalar. Çakışma var mı telefonda bakılmalı.

### C6. Robot — bilgi, video, fotoğraf
1. "Fıstık ağacı budaması nasıl" → Pusula kaynaklı cevap + video kartı + fotoğraf + YouTube arama bağlantısı + yapay zekâ uyarısı. Birim GEÇTİ; videoların YouTube'da hâlâ açık olduğu (gömülü kimlikler) DENENMEDİ, bağlantı denetimi gerek.
2. Pusula "bilmiyorum" (handoff) derse Nuvia robot cevabı gelir, çıkmaz yok. DENENMEDİ telefonda.
3. Video tıklayınca dış uygulama (YouTube) açılıyor mu; "yönlendirme yok" isteği ile çelişir mi (ürün kararı). DENENMEDİ.

### C7. Robot sesi
1. Mikrofonla sor → cevap sesli gelmeli. Ses tanıma (`expo-speech-recognition`) telefonda DENENMEDİ.
2. Ses rehberi açıksa her cevap okunur (Ayarlar → Sesli rehber). DENENMEDİ.
3. Nuvia kadın sesi: sunucu WAV üretti (A5). Telefonda `expo-audio` ile çalma DENENMEDİ: sıra (a) önbellek dosyasına yaz + çal, (b) `data:` adresi, (c) cihazın en iyi tr-TR sesi. Hangi kademenin çalıştığı telefonda gözlenmeli (çalmıyorsa konus.ts'e günlük eklenir). Yeni APK şart (0.2.0'da var); eski APK'da (c) devreye girer.
4. Cevap uzunluğu: okunacak metin 600 karakterle sınırlı; uzun cevapta kesilir. Ses gecikmesi ~4 sn + ağ; "konuşuyor" göstergesi/durdurma düğmesi yok olabilir. DENENMEDİ.
5. Ses sırasında kapatınca susması (`sustur`), bildirim/arama araya girince davranış. DENENMEDİ.
6. Nuvia ses bütçesi: her cevap için TTS çağrısı (4 $/ay sınırı; `bu_ay_usd` şu an ~0,001). Yoğun kullanımda 429 olur → cihaz sesi. DENENMEDİ.
7. Robot uç noktaları kullanıcı başına dakikalık sınırlı; sınır aşılınca davranış DENENMEDİ.

### C8. Hava / don
1. Hava sayfası: 7 günlük don satırları ("Gece en düşük −3°", olasılık yalnız onaylı eşikle). Birim + e2e GEÇTİ; gerçek Open-Meteo verisiyle ve farklı il/yükseklikte DENENMEDİ.
2. Mahalle (köy) bazlı koordinat kullanıyor mu: arazi koordinatı kaynaklı, köy merkezi yaklaşık olabilir. DENENMEDİ.
3. Buzlanma bayrağı (tmin ≤ 0 ve yağış ≥ 1 mm) gerçek veride DENENMEDİ.
4. Anlık bildirim: onaylı eşik varsa en erken uyarı gününde "yarın sabah / N gün sonra don" metni. `scanFrost` çalışması için sunucu uyanık olmalı (C1.7). Bildirim metni 7 gün ufku için ayrıca test edilmedi. DENENMEDİ.
5. Onaysız (taslak) eşikte hiçbir uyarı/olasılık yok (kural 1): GEÇTİ (birim).

### C9. Takvim ve sulama
1. İş takvimi: onaylı örnek takvim (kiraz, fıstık, zeytin) görünür; taslak olanlar rozetli, uyarı üretmez. e2e GEÇTİ; telefonda DENENMEDİ.
2. Takvimi dışa aktarma (telefon takvimi). DENENMEDİ.
3. Sulama sayfası gerçek su ihtiyacı, tasarruf raporu (g21 testleri GEÇTİ; gerçek hava geçmişiyle DENENMEDİ).
4. Sulama komutu/vana (kural 3): bu turda değişmedi; cihaz yok, DENENMEDİ.

### C10. Kurulum / güncelleme
1. Eski APK (0.1.0) açılınca "Yeni sürümü indir" ekranı çıkar (`site/surum.json` enAz 0.2.0). DENENMEDİ telefonda.
2. Yeni APK (0.2.0) eski imzayla üzerine kurulur mu (aynı keystore EAS'ta; "uygulama yüklenemedi" olursa eskisini kaldır). DENENMEDİ.
3. İlk açılışta OTA güncellemesi iniyor mu. DENENMEDİ.
4. Site indirme sayfası: SHA-256 (ecd25e50…8638) ve boyut (78 MB) güncellendi; indirilen dosyanın karması eşleşmeli. Sunucudan Content-Length 82163670 doğrulandı.
5. Giriş: SMS (telefon açıkken), yedek demo hesabı. DENENMEDİ bu turda.

### C11. Güvenlik ve kurallar (kısa kontrol listesi)
- Taslak bilgi rozetli, uyarı/komut üretmez (kural 1): birim GEÇTİ.
- Yapay zekâ doz/oran uydurmaz, BKÜ'ye yönlendirir (kural 2): Nuvia + sunucu süzgeci GEÇTİ.
- Nuvia anahtarı yalnız sunucuda: telefon Nuvia'yı çağırmıyor (`/robot/*` sunucu ucu). Mobil pakette anahtar yok: DENENMEDİ (APK içinde `nvp_` araması yapılmalı).
- Robots/lisans (kural 6): tarama robots.txt'e uyar; kaynak+tarih saklanır.
- Başkasının vanası/sorusu: yetki testleri önceki turlardan GEÇTİ.

## D. Telefonda deneme sırası (öneri)
1. Eski APK → güncelleme ekranı → yeni APK kur (C10).
2. Giriş → robot karşılama → tarla ekle (GPS) (C4, C5).
3. Robota yazılı + sesli soru; sesi kadın sesi mi cihaz sesi mi not et (C6, C7).
4. Fotoğraflı Uzmana sor (C3), Sorularım'da durum (C2).
5. Haberler / Resmî kaynaklar; yönetici ucundan tarama tetikle, sonuçları kaydet (C1).
6. Hava/don satırları, takvim (C8, C9).
Bulguları şu biçimde ver: madde no · ne oldu · ekran görüntüsü/adb logcat satırı. Ses için `adb logcat | findstr -i "audio expo ses"`.
