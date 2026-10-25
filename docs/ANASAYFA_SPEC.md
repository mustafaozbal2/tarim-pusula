# Ana sayfa şartnamesi (docs/referans/anasayfa_hedef.png ile BİREBİR)

Kural: Görsel hedef tek kaynaktır. Oklar ve dışarıdaki etiketler (Güncel Haberler, Bilgilendirmeler, ...) uygulamada YOKTUR; yalnız telefon ekranının içi yapılır. Renk/ölçüyü hedef görselden piksel örnekleyerek al (Playwright ekran görüntüsü ile 390x844 üzerinde karşılaştır, fark raporu docs/gorsel/ANASAYFA_FARK.md).

## Dikey sıra (yukarıdan aşağıya)
1. Üst bant: turkuaz (hedefteki degrade, köşegen açık şerit). Solda amblem (resim yuvası "Amblem": images/amblem.png; yoksa "Resim 1" kutusu) ve altında "TARIM PUSULA". Sağda 7 beyaz yuvarlak ikon, soldan sağa: Arazilerim, Arazi İşlemleri, Verim Haritası, Hava Durumu, Uzman Desteği, Mobil Bildirim (kırmızı sayı rozeti), Profil Ayarları (dişli). İkonlar emoji değil, tek tip çizgi/dolgu SVG; ikon yuvası "images/ikon_*.png" varsa onu kullan, yoksa SVG.
2. Kayan şerit: 5 dikey kart (yuvarlak köşe, görsel + altında 2 satır başlık), yatay kaydırılır ve ~4 sn'de bir kendiliğinden kayar (dokununca durur). Başlık örnekleri: Tarımsal Üretim Stratejik Konumu · Gübreleme Yöntemleri · Drone ile İlaçlama · İklim Krizi Gıda Krizinin Habercisi · Tarımsal Üretimde Planlama Nasıl Olmalı. Kartlar duyuru/haber/hibe/destek akışından (panelden girilen duyurular + haber kaynağı) beslenir; görsel yoksa "Resim N". Karta dokununca detay sayfası.
3. Orta: sol/orta çiftçi çizimi (images/ciftci.png; yoksa "Resim" yuvası), sağda seçili arazinin adı (büyük, turkuaz) ve altında "İl, İlçe" (örnek: Kiraz Bahçesi / Isparta, Merkez). Dokununca arazi değiştirici.
4. Sekmeli kart: sekmeler Faaliyet Zamanı · Faaliyet Rehberi · Erken Uyarılar · Hibe, Kredi ve Desteklemeler · Hepsi (seçili sekme koyu turkuaz). Altında satırlar: solda tarih rozeti (Ay / gün / yıl, 3 satır, turkuaz), sağda açık turkuaz yuvarlak kutuda metin (Bireysel sulama sistemlerine %50 hibe desteği; Kiraz çiçeği zirai don tehlikesi; Kiraz sineği ilaçlama zamanı; Kiraz kalite artırıcı gübreleme). Satır sayısı kadar kaydırılır.
5. Alttaki üç tuş (kare/daire/üçgen) telefonun sistem çubuğudur; uygulamada yapılmaz.

## Veri bağlantıları
- Sekmeler gerçek veriden gelir: takvim şablonu (Faaliyet Zamanı/Rehberi), erken uyarı motoru (yalnız ONAYLI veri; onaysız asla uyarı üretmez), duyuru+hibe akışı. Veri yoksa kısa, dürüst boş durum metni.
- Onaylı olmayan bilgi çiftçi ekranında rozet YAZMADAN gizlenir ve uyarı üretmez (iç kural korunur).
- Hedefteki örnek metinler yalnız demo tohum verisidir; kaynak+tarih etiketi satır detayında görünür.

## Sol köşe "Dikkat" bildirimi
Aktif erken uyarı varsa üst bandın altında sol kenarda küçük kırmızı-amber "Dikkat" rozeti belirir (dokununca Erken Uyarılar sekmesi). Uyarı yoksa görünmez; yerleşim değişmez.

## Sağ kenar menüsü
Ekranın sağ kenarında ince tutamaç; çekince açılır/kapanır panel: Arazi · Üretim planı · Takvim (+ Veri cüzdanım değil: o Ayarlar'da). Ana düzeni bozmaz.

## images/ klasörü
Kökte `images/` klasörü (mobil derlemede `apps/mobile/assets/images` buna sembolik değil, KOPYALANIR: `scripts/sync-images.mjs`, `pnpm run images` ile; demo ve build öncesi otomatik çalışır). Her yuva için DOSYA ZATEN VARDIR: üzerinde "Resim 1", "Resim 2" ... yazan nötr gri yer tutucu PNG/JPG'ler (betikle üretilir). Mustafa aynı adlı dosyayı üzerine yazar; kod değişmez. Adlar: amblem.png, ciftci.png, ikon_arazilerim.png, ikon_arazi_islemleri.png, ikon_verim_haritasi.png, ikon_hava.png, ikon_uzman.png, ikon_bildirim.png, ikon_ayarlar.png, kart_1.jpg ... kart_5.jpg ve sonradan eklenenler. `images/README.md`: ad, ideal piksel boyutu, nerede görüneceği tablosu. Yer tutucuyu yeniden üretme betiği mevcut dosyayı ASLA ezmez.
