# Veri raporu (8 Kasım 2026)

Kapsam notu: Canlı veritabanına bağlanma izni verilmedi (üretim verisi okuma reddedildi). Bu yüzden "kaç duyuru alındı / kaç haber oldu / il bazında dağılım" (TP-V2) ve silinecek demo kayıt listesi (TP-V1) ile Mustafa'nın arazisi için don uyarısı kontrolü (TP-V3 b-d) YAPILMADI. Aşağıdakiler yerelden, yalnız herkese açık sitelere (robots.txt'e uyarak) ve gerçek Nuvia'ya yapılan denemelerdir.

## 1. Kaynak sağlığı (yerel yoklama, 81 il müdürlüğü)
- 78 kaynak açılıyor ve haber/duyuru listesi veriyor.
- Açılmayan: Adana, Bingöl, Iğdır (bu bilgisayardan bağlantı kurulamadı; canlıdan ayrıca denenmeli). Bakanlık ana sitesi robots.txt ile kapalı (kural 6), taranmıyor.
- Render günlüğünde (7-8 Kasım gecesi) Aksaray, Ağrı, Konya, Mardin, Sakarya, Uşak haber sayfaları 20 sn zaman aşımına uğradı; süre 40 sn'ye çıkarıldı.

## 2. TP-V3 (a): Gaziantep 8 Kasım
- Gaziantep İl Müdürlüğü ana sayfasında 15 öğe var; başlıklarında don, zirai don, soğuk, dolu geçen YOK (bugün resmî don uyarısı yayınlanmamış).
- MGM'nin zirai don uyarısı sayfası dinamik; genel HTML ayıklayıcıyla okunamıyor, ayrı okuyucu gerekir (açık iş).
- Open-Meteo (jarvis-20): 8 Kas en düşük 3,5°C, 9 Kas 1,9°C. Uygulama uyarısı yalnız UZMAN ONAYLI eşik varsa üretir (kural 1). Yarın için uyarı çıkmaması, Antep fıstığı çiçeklenme eşiği onaysızsa DOĞRU davranıştır; canlı veritabanında eşiğin durumu doğrulanamadı.

## 3. TP-V4: 10 örnek haberin kaynakla karşılaştırması (yerel, gerçek sayfa + gerçek Nuvia)
Gaziantep, Isparta, Aydın, Konya, Mersin, Şanlıurfa, Manisa, Antalya, Muğla, Bursa; her ilin listesindeki ilk haber.

| İl | Başlık/özet doğru mu | Bulgu |
|---|---|---|
| Gaziantep, Isparta | Evet (Bir Sürü Olsun, 4-13 Kasım başvuru) | Özet kaynakla tutarlı, tarihler metinde var |
| Aydın | Evet | Staj programı: ilgili=false (doğru) |
| Konya | Evet | Okul kantini eğitimi: ilgili=false (doğru) |
| Mersin | Başlık aynen | "İl Müdürlüğümüze Ziyaret" (TMO ziyareti): ilgili=TRUE yanlış; protokol ziyareti çiftçiye ilgisiz. Nuvia `haber_analiz` yönergesine "ziyaret/tören/protokol = ilgisiz" eklenmeli |
| Şanlıurfa | HAYIR | Sayfa metni boş çıktı; Nuvia yalnız başlıktan "Mısır ve Mercimek" başlığı ve ürün "mısır" UYDURDU. DÜZELTİLDİ: metin <40 karakterse Nuvia çağrılmaz |
| Manisa | Evet | Kadın çiftçi yarışması ilgili=true (sınırda) |
| Antalya | Kısmen | Başlık değişmiş ("ONLİNE EĞİTİMLER" → "Antalya'da Tarım Online Eğitim Videoları ve Başvurular"), içerik tek bağlantı |
| Muğla | Evet ama ürün hatalı | Defne fidanı haberine ürün "zeytin" eklenmişti. DÜZELTİLDİ: ürün yalnız haber metninde geçiyorsa kabul edilir |
| Bursa | Evet | Tam buğday ekmeği kampanyası: ilgili=false (doğru) |

Diğer bulgular:
1. Yayın tarihi: 10 haberin 10'unda liste ve sayfadan tarih ÇIKARILAMADI (siteler yayın tarihini düz metin olarak vermiyor; sayfadaki tarihler başvuru/etkinlik tarihi). Haber kartında tarih bilinmeyen haber için tarama günü kullanılıyor; "tarihi bilinmiyor" ayrımı yapılmalı. AÇIK.
2. Başlıklarda emoji ve sıfır genişlikli karakter vardı (kural 7: arayüzde emoji yok). DÜZELTİLDİ: temizleniyor.
3. Özetlerde uydurma sayı/tarih görülmedi; doz içeren özet zaten atılıyor.

## 4. Yapılacaklar (canlı DB izni gelince)
- TP-V2: il bazında alınan / eklenen / ilgisiz atılan duyuru sayısı, hiç veri vermeyen kaynaklar.
- TP-V1: demo haber (kaynağında "örnek veri"), örnek takvim şablonları, demo bildirimler, örnek cihaz kayıtları için ÖNCE yedek + liste, sonra (Mustafa onayıyla) silme. Gerçek kullanıcı ve gerçek arazilere dokunulmayacak.
- TP-V3 (c, d): Mustafa'nın Şahinbey arazisi için eşik durumu, scanFrost günlüğü.
