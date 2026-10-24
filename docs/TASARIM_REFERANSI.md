# Tasarım referansı — ESKİ UYGULAMA ÜZERİNE KURULACAK

Mustafa'nın kararı: şu anki demo tasarımı (çok büyük yazı/düğme, az içerik, boş sayfalar) KABUL EDİLMEDİ. Tasarım, eski Tarım Pusula uygulamasının yapısı ve rengi korunarak, üstüne yeni özellikler eklenerek yeniden yapılacak.
Referans görseller (önce bunlara bak): docs/referans/eski_uygulama_slayt10.jpg (yönetim paneli: arazi ekleme, içerik ekleme), slayt11.jpg (mobil: Duyurular / Bildirimler), slayt12.jpg (Kc ve toprak listeleri), slayt13.jpg (ana ekran şeması ve özellik listesi). Kaynak sunum: docs/referans/tarim_pusula_sunum.pptx.

## Eski mobil uygulamanın yapısı (korunacak)
- Üstte açık gri başlık alanı: sol-üstte KONUM (ör. "ŞAHİNBEY") ve ısı ("12,75 °C") + hava simgesi, sağda ÇİFTÇİ KARAKTERİ illüstrasyonu (şapkalı, sebze sepetli, çizme). Karakter yeni tasarımda da kalır (kendi çizimimiz; eskisini birebir kopyalama, aynı tarzda yeniden çiz).
- Altında beyaz yuvarlak köşeli kart içinde iki sekmeli anahtar: **Duyurular | Bildirimler** (seçili sekme koyu yeşil dolgu, beyaz yazı).
- Liste: her satır bir şerit: solda TARİH kutucuğu (gg/aa/yyyy, koyu yeşil), sağda BAŞLIK (yeşil dolgu, beyaz kalın yazı). Satırlar sıkı aralıklı; bir ekranda 5+ satır görünür.
  Duyuru örnekleri: "Antepfıstığında Gübreleme Zamanı", "Zeytinde Budama Zamanı", "Antepfıstığı bahçelerinde Zirai Don Tehlikesi".
  Bildirim örnekleri: "Arazinizin Sulama İhtiyacı Var", "Hava Sıcaklığı Yüksek Düzeyde Gerekli Tedbirleri Alınız", "Hava Sıcaklığı 0 Derece Altında Don Tehlikesi Mevcut".
- Alt/ana ekran şemasında 6 ana özellik simgesi (daire içinde): Arazi, Üretim planlama, Takvim/Duyuru, Erken uyarı, Akıllı cihazlar, Uzmana sor. Bunlar yeni uygulamada hızlı erişim şeridi olur.
- Liste ekranları (Bitki türü + Kc, Toprak türü + tarla kapasitesi/solma noktası): üstte "Yeni ... ekle" yeşil düğme + "+" ve arama kutusu, altında sade tablo (Düzenle / Sil).
- Yönetim paneli: SOL koyu yeşil kenar menü (Ana Sayfa, Arazi işlemleri > Arazi listele, Üretim planlama > Ürün arz talep / Verim haritası / Desteklenen ürünler, Soru işlemleri, Toprak analiz işlemleri, Depolama işlemleri…), sağda beyaz form kartı; breadcrumb; etiketli sıkı form alanları; sağ-altta İptal / Kaydet.

## Renkler (eski uygulamadan ölçüldü)
- Koyu yeşil (seçili sekme, kenar menü, başlık): #064D3B
- Liste yeşili (satır dolgusu): #24976E
- Açık zemin kartları: #F3FAF9, beyaz #FFFFFF, sayfa zemini açık gri #F1F3F4
- Uyarı: kehribar #F2C14E (yalnız uyarı rozetleri), tehlike/sil: kırmızı-pembe #E0245E ya da #9B2F1E, su mavisi #1D5B7A (yalnız sulama)
- Önceki demo paletindeki #14392B, #E3EFD2 vb. terk edilir; yukarıdaki palet tek kaynak olur. Kontrast: beyaz yazı #24976E üstünde 3:1 civarı; küçük yazıda #064D3B kullan, ya da satırı #1F8A62'ye koyulaştır (WCAG AA ≥ 4.5 sağlanmalı: ölç ve gerekirse tonu ayarla, kararı KARARLAR.md'ye yaz).

## YOĞUNLUK KURALLARI (UX_KURALLARI.md'deki "büyük yazı/56 px" kuralının YERİNE geçer)
- Telefonda (390×844) ana ekran: hava/konum başlığı + sekmeli liste + hızlı erişim şeridi, kaydırmadan EN AZ 6 liste satırı görünsün.
- Gövde yazısı 14–15 px, satır başlığı 15–16 px, ikincil 12–13 px (yaşlılar için sistem yazı boyutu büyütmesine uyum + uygulama içi "Yazı boyutu: Normal/Büyük" ayarı; "Büyük" mod eskiden kabul ettiğimiz 18 px düzenidir).
- Dokunma alanı en az 44 px (satır 44–48 px). Birincil düğme 44–48 px yükseklik, köşe yuvarlaklığı 8–10 px (hap biçimli devasa düğme YOK).
- Ekran başına tek ana iş kuralı kalkar; bir ekranda birden fazla bilgi grubu olabilir (kart, tablo, liste). Boş alan bırakma: dolu, düzenli, profesyonel.
- Seçim formlarında "Hepsi" gibi seçenekler açık seçenek olarak sunulur (boş bırakma belirsizliği olmasın): hedefleme alanları "Hepsi" varsayılanı ile gelir.
- Tablolar ve listelerde arama, filtre, sıralama; panelde sayfalama.
- Simgeler çizgi (stroke) simge seti, emoji yok. Yazı tipi Manrope ya da Inter; sayılar tabular.
