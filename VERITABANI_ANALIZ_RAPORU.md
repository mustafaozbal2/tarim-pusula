# Veritabanı analiz raporu (9 Kasım 2026, canlı Neon)

Yöntem: yalnız-okunur sorgular (`BEGIN READ ONLY`), kişisel veri yazdırılmadı. Hedefleme sınaması gerçek uygulama kodu (`matchesField`, `checkTargeting`) ile canlı veri üzerinde yapıldı.

## 1. Özet
| Soru | Cevap |
|---|---|
| Kaç otomatik haber girildi? | **96** (hepsi 8-9 Kasım; ilk tarama 8 Kasım 01:50 TSİ'de 93, sonra 3 yeni) |
| Kaç kaynak taranıyor? | **81 il müdürlüğü**, hepsi aktif, hepsi en az bir kez kontrol edildi, hepsinin son durumu "tamam"; son tur bugün 08:16-08:19 TSİ |
| Hangi kaynaklardan haber alındı? | **60 il** en az bir haber verdi, **21 il hiç haber vermedi** (liste §3) |
| Doğru yetkiye gidiyor mu? | **Evet.** Hedefleme hatası **0** (§4) |
| Gaziantep haberini Şanlıurfa'daki görür mü? | **Hayır.** 60 il yetkilisi x 96 haber sınamasında kapsam ihlali 0 |
| Sorunsuz çalışıyor mu? | Çekirdek zincir çalışıyor; **2 hata düzeltildi, 5 açık sorun var** (§6) |

## 2. Haber hattı sayıları
- Tarama bir listede yaklaşık 1.109 bağlantı gördü ve "görüldü" işaretledi. İlk turda her kaynaktan yalnız en yeni 3 haber değerlendirilir (en çok 243); bunların **93'ü (%38)** haber oldu, kalanı Nuvia'ya göre çiftçiye ilgisiz bulunup atıldı. Atılan sayısı ve nedeni kayıt altında tutulmuyor (açık sorun A3).
- Bu 96 haberin **tamamı** "taslak, uzman onayı bekliyor" olarak işaretli (kural 1); bildirim üretmiyor.
- Kategori: yönlendirme 53, güncel 19, bilgilendirme 13, önlem 6, teknoloji 5.
- Ürün etiketi: 68 haber ürün etiketsiz (ilin tüm çiftçileri görür), 28 haber ürüne bağlı (yalnız o ürünü ekenler görür).
- Görsel: 80 haberde kaynak sitenin görseli var, 16'sında yok (uygulama kütüphane görseli koyar).
- Yinelenen bağlantı: **0** (96 bağlantı, 96 tekil). Aynı başlık 3 grupta tekrar ediyor ("Bir Sürü Olsun Projesi…", 13 kayıt): bu ulusal bir proje, her ilin kendi sayfasında yayınladığı için **doğru**, her kayıt kendi iline hedefli.

## 3. İl bazında haber (60 il haber verdi)
- 3 haber: Balıkesir, Düzce, Muğla, Ordu, Uşak, Çankırı.
- 2 haber: Adana, Ankara, Artvin, Bartın, Batman, Diyarbakır, Erzincan, Erzurum, Eskişehir, Hatay, Kayseri, Kırklareli, Kırıkkale, Kırşehir, Mardin, Mersin, Muş, Rize, Siirt, Sinop, Tokat, Trabzon, Van, Çorum.
- 1 haber: Adıyaman, Afyonkarahisar, Aksaray, Antalya, Ardahan, Aydın, Bayburt, Bilecik, Bingöl, Bitlis, Burdur, Çanakkale, Elazığ, Gaziantep, Gümüşhane, Hakkâri, İstanbul, Iğdır, Karabük, Karaman, Kilis, Kocaeli, Konya, Kütahya, Malatya, Osmaniye, Sivas, Yalova, İzmir, Şanlıurfa.
- **0 haber (21 il):** Amasya, Ağrı, Bolu, Bursa, Denizli, Edirne, Giresun, Isparta, Kahramanmaraş, Kars, Kastamonu, Manisa, Nevşehir, Niğde, Sakarya, Samsun, Tekirdağ, Tunceli, Yozgat, Zonguldak, Şırnak. Nedenleri ayrıştırılamıyor: o gün çiftçiye ilgili haber çıkmamış olabilir ya da sayfa yapısı okunamıyor olabilir. Denizli, Bursa, Manisa, Isparta gibi tarımsal illerde 0 olması şüpheli, ayrıca incelenmeli.

## 4. Doğru yetkiye gidiyor mu? (en kritik sınama)
1. **Kaynak-hedef eşleşmesi:** 96 haberin 96'sında hedeflenen il = haberi alan kaynağın ili (uyuşmayan **0**). Çanakkale/İstanbul gibi ASCII yazılmış il adları hedeflemede sorun çıkarmıyor (karşılaştırma Türkçe harfe duyarsız).
2. **Çiftçi tarafı (10 arazi):** her çiftçi yalnız kendi ilinin haberini görüyor. Gaziantep'teki 8 arazi 1 haber görüyor (tek Gaziantep haberi), Ankara arazisi 2, Isparta arazisi 0; **başka ilden görünen haber: 0**.
3. **Yetkili tarafı (4 onaylı yetkili):**
   - Bakanlık / Yönetim (ulusal): 96 haberin hepsini görür (beklenen).
   - Gaziantep İl Müdürlüğü: yalnız Gaziantep'in 1 haberini görür.
   - Şehitkamil İlçe Müdürlüğü: **0** görür. Haberler il genelinde hedefli olduğu için ilçe yetkilisine düşmüyor; ilçe haberi ayrıştırılmadığı için bu ilçelerin haberi ilçe yetkilisine gelmez (iyileştirme İ1).
4. **60 il yetkilisi x 96 haber = 5.760 çift** (haberi olan 60 il; kalan 21 ilin hiç haberi olmadığından ihlal ihtimali yok): hiçbirinde başka ilin haberi görünmedi (ihlal 0).
5. **Bulunan ve düzeltilen açık:** `Onay kuyruğu` ucu (`/panel/review-queue`) uzman rolündeki herkese **tüm illerin** taslak haberlerini döndürüyordu; il/ilçe uzmanı başka ilin taslağını görebiliyordu (`/staff/drafts` ucu ise zaten kapsamlıydı). Artık yetkilinin kapsamıyla süzülüyor (test eklendi: Şanlıurfa uzmanı Gaziantep taslağını görmüyor, Gaziantep uzmanı görüyor). Bu düzeltme bu raporla birlikte yayınlanıyor.

## 5. Haberlerin doğruluğu (96 başlığın tamamı elle okundu)
Büyük çoğunluk kaynakla tutarlı. Bulunan hatalar:
| Sorun | Örnek | Durum |
|---|---|---|
| Yabancı sözcük karışmış | Gaziantep: "…başvuruları **begins** 4 Kasım'da" | Nuvia çıktısı; başlık temizliği yok (A1) |
| Eski haber | Çanakkale: "25 Eylül'e kadar başvuru" (süresi geçmiş) | Yayın tarihi çıkarılamıyor, "kaç gün önce" süzgeci çalışmıyor (A2) |
| Yanlış ürün etiketi | Bartın: Adana'da basınçlı sulama eğitimi → "narenciye" | Ürün süzgeci güçlendirildi ama bu kayıt eski |
| İlgisiz haber geçmiş | Uşak: "Bakan Yumaklı… Ziyaret Etti", Burdur: genel toplantı | Nuvia yönergesi sonradan sıkılaştırıldı; eski kayıtlar duruyor (A4) |
| Tarih | 96 haberin 89'unda yayın tarihi = alındığı gün | Yayın tarihi çıkarıcı bugün yayınlandı; sadece yeni haberleri kapsar |
- Doz/ilaç miktarı içeren haber: **0**. Emoji/başlık sorunu bugünkü düzeltmeyle yeni haberlerde yok.

## 6. Sistem sağlıklı mı?
**Çalışanlar:** tarama zinciri (kaynak → Nuvia → haber → doğru ile hedefleme), hedefleme/yetki, yapay zekâ cevapları (6 soruda 5 geçici cevap yazıldı; cevaplar tarım dışı soruda reddediyor, doz içermiyor), UptimeRobot, API sağlık, güvenlik başlıkları.

**Düzeltilenler (bu raporla yayınlanıyor):**
1. Onay kuyruğundan başka il taslağının görünmesi.
2. Yönetim panelinde "kaç kaynak haber verdi" kutusu 0 gösteriyordu (yanlış sayaç); artık 60.

**Açık sorunlar:**
- **A1** Nuvia çıktısında yabancı sözcük/başlık hatası.
- **A2** Eski haber süzgeci yok (yayın tarihi bilinmediği için).
- **A3** Atılan haber ve nedeni kaydedilmiyor, bu yüzden "kaçı ilgisiz atıldı" kesin söylenemiyor.
- **A4** Eski ilgisiz haberler (ziyaret/toplantı) duruyor; elle ya da uzman onayında ayıklanmalı.
- **A5** Test/örnek veri canlıda duruyor: 31 elle girilmiş "örnek/test verisi" duyuru **tüm Türkiye'ye hedefli** (örneğin "Balıkesir İl Müdürlüğü (örnek veri)" haberini Gaziantepli de görüyor, kaynak adında "örnek veri" yazıyor); 35 örnek takvim şablonu; Antep fıstığı çiçeklenme don eşiği (-2 °C) kaynağı "Örnek veri (demo)" ama "uzman onaylı" işaretli. Silme için Mustafa'nın onayı gerekiyor (TP-V1).
- **A6** Tarama sıklığı doğrulanamıyor: kaynak başına yalnız son kontrol zamanı tutuluyor. 8 Kasım 00:00-19:00 arasında "yeni haber" kaydı yok (yeni haber çıkmamış ya da sunucu uyuyordu). Günde 5 turun gerçekten çalıştığına dair tur geçmişi tutulmalı.
- **A7** `/fields/:id/announcements` ucu son 500 duyuruyu çekip süzüyor (şu an 128, sorun yok); 500'ü geçince eski ama ilgili duyurular düşer. Süzgeç SQL'e taşınmalı.

## 7. Don ve bildirim (Gaziantep, Şahinbey)
- Gaziantep'te 8 arazi var; hepsinin cihaz bildirim kaydı (push) var.
- Don uyarısı için yalnız **Antep fıstığının** onaylı eşiği var (çiçeklenme -2 °C, kaynak "demo"). Zeytin, kiraz, buğday, ceviz, incir için onaylı eşik **yok**, bu ürünler için uyarı üretilmemesi kural 1 gereği **doğru**.
- Tahmin en düşük 1,9 °C (9 Kasım) > -2 °C olduğundan Antep fıstığı arazisinde uyarı çıkmaması doğru. Bugüne kadar gönderilen don bildirimi: **0** (kayıt tablosu boş).
- Bakanlığın Gaziantep sayfasında 8 Kasım'da don duyurusu yok.

## 8. Önerilen iyileştirmeler
İ1 ilçe haberini ilçeye hedefle; İ2 atılan haberleri nedeniyle kaydet; İ3 tur geçmişi tablosu; İ4 eski/ilgisiz otomatik haberleri ayıkla; İ5 test verisini yedek alıp sil (onayla); İ6 0 haber veren 21 ilin sayfa yapısını tek tek incele; İ7 MGM zirai don uyarısı için ayrı okuyucu.

## Ek: 9 Kasım 2026 incelemesi ve temizlik

**243 haberden neden 93'ü yayında?**
- İlk taramada kaynak başına yalnız en yeni 3 haber yapay zekâya gönderildi, kalanlar "görüldü" sayıldı. Sonraki taramalar yalnız yeni çıkanları alır.
- Bugünkü tam deneme (81 kaynak × 3 haber, 231 haber değerlendirildi): 121 kabul, 87 ilgisiz, 8 süresi geçmiş, 7 eski, 8 bağlantı/çözümleme hatası.
- İlgisiz sayılanların çoğu doğruydu: ziyaret, protokol toplantısı, staj, gıda denetimi, spor, fuar, ödül.
- Yanlış red örnekleri: turunçgil mücadele planı, arıcılık desteği, besilik sığır başvurusu, mercimek desteği, toprak analizi eğitimi, manda dağıtımı. Bunlar için yapay zekâdan önce çalışan başlık kuralı eklendi.
- 14 sayfada metin `<p>` içinde değildi ve okunamıyordu. Uzun metin düğümü ayıklama eklendi.
- Artık her haberin sonucu (eklendi, ilgisiz, eski, süresi geçmiş, metin yok, hata, robots) `scan_log` tablosuna yazılıyor.

**Temizlik:** örnek duyuru, soru, takvim şablonu, pazar fiyatı ve cihaz kayıtları silindi. Yedek `.yedek/` klasöründe, git dışında.

**Bitiş ve ilçe güncellemesi:** var olan 108 otomatik haber yeniden okundu.
- 24 habere metinden başvuru bitişi verildi; Bir Sürü Olsun haberleri 13.11.2026 gün sonunda kalkacak.
- 19 habere ilçe hedefi verildi.
- Diğerlerine yayından 45 gün sonrası bitiş verildi.
- Başlık kuralı ya da geçmiş bitiş nedeniyle 11 haber yayından kalktı.
- Sonuç: 97 haber yayında.
