# Demo rehberi — bilgisayarda gezilebilir Tarım Pusula

Amaç: G0–G15 çıktısını tarayıcıda gezmek ve beğenmediğiniz yerleri not etmek. Docker, internet anahtarı, SMS ya da hesap gerekmez.

## Çalıştırma

```
pnpm install
pnpm run demo
```

- İlk çalıştırmada mobil web paketi ve panel derlenir (birkaç dakika). Sonraki açılışlar birkaç saniyedir.
- Hazır olunca iki adres tarayıcıda kendiliğinden açılır:
  - Mobil (telefon boyutunda, ortada dar sütun): http://localhost:8200
  - Kurum paneli: http://localhost:8201
  - API sağlık ucu: http://localhost:8210/health
- Kodu değiştirdiyseniz: `pnpm run demo -- --rebuild`. Tarayıcıyı açmasın: `pnpm run demo -- --no-open`.
- Durdurmak: terminalde Ctrl+C. Veri bellektedir; her açılışta demo verisi sıfırdan kurulur.
- Demo yalnız `DEMO_MODE=1` ile çalışır (komut bunu kendisi ayarlar). Üretim ortamında (`NODE_ENV=production`) demo kodu ve `/demo/info` ucu hiçbir koşulda açılmaz.

## Giriş bilgileri

| Nerede                   | Telefon                             | Kod                                             |
| ------------------------ | ----------------------------------- | ----------------------------------------------- |
| Mobil (çiftçi)           | +905320000001 (kendiliğinden dolar) | Ekranın altında yazan "Demo kodu: 123456"       |
| Panel (kurum yöneticisi) | +905320000002 (kendiliğinden dolar) | SMS adımında da, doğrulayıcı adımında da 123456 |

Panelde ilk girişte doğrulayıcı kurulum ekranı çıkar; telefona uygulama kurmanız gerekmez, 123456 yazın.

## Ekran ekran kontrol listesi

Her ekranın üstünde "Örnek veri" rozeti vardır: gösterilen bilgi gerçek değil, örnektir.

### Mobil (http://localhost:8200)

- [ ] **Giriş**: telefon dolu mu, "Demo kodu: 123456" altta görünüyor mu, büyük yazı ve büyük düğmeler rahat mı?
- [ ] **Bugün**: "Burç Köyü Antep fıstığı" tarlası; "Bu gece don bekleniyor" uyarısı (kaynak + saat), "Neden?" açılıyor mu; bitkinin su ihtiyacı; "Örnek duyuru" kartı.
- [ ] **Tarlalarım**: 2 tarla (Burç Köyü Antep fıstığı, Yayla zeytinliği). Tarla ekleme yolları (köy listesi, harita, yakınım yapsın) çalışıyor mu? Takvim ve uydu (bitki sağlığı) düğmeleri.
- [ ] **Takvim**: "Şimdi / Yaklaşan" işler, taslak rozeti ve "yalnız bilgi" notu.
- [ ] **Sulama** (Tarlalarım > Sulama): sanal cihaz bağlı; süre seç, onayla, ack çizelgesi, "Durdur". 30 dakikayı aşan süre reddedilmeli.
- [ ] **Soru sor**: hazır sorular ve beklenen davranış:
  - "Sulama için en uygun saatler hangisi?" > kaynaklı kısa cevap (örnek belge)
  - "Don bekleniyorsa bahçede nelere dikkat edilir?" > hava verisinden kaynaklı cevap
  - "Antep fıstığında bahçe temizliği ve budama ne zaman planlanır?" > kaynaklı cevap
  - "İlaç dozu ne kadar olmalı?" > doz verilmez, uzmana/ilçe müdürlüğüne yönlendirir
- [ ] **Pazar**: Antep fıstığı, buğday, arpa için örnek borsa fiyatı; kaynak + tarih; trend ve "nerede satarım".
- [ ] **Bitki sağlığı (uydu)**: "ÖRNEK VERİ - gerçek uydu verisi değil" uyarısı.
- [ ] **Veri cüzdanı**: verilerim, dışa aktar, paylaşım.
- [ ] Tarayıcıyı çevrimdışı yapın (geliştirici araçları > Ağ > Çevrimdışı): son veri ve "son güncelleme" saati görünüyor mu?

### Kurum paneli (http://localhost:8201)

- [ ] **Giriş**: SMS adımı, doğrulayıcı adımı, ekranda yazan demo kodu.
- [ ] **Duyurular**: duyuru yaz, il/ilçe ve ürün hedefle.
- [ ] **Onay kuyruğu** ve **Bitki paketleri**: taslak/onaylı ayrımı, dört göz kuralı (kendi girdiğinizi kendiniz onaylayamazsınız).
- [ ] **Denetim kaydı**: yaptığınız işlemler listeleniyor mu?
- [ ] Panelde duyuru yazıp mobilde (Bugün) görünmesi için duyuruyu onaylatmak üzere ayrıca uzman hesabı gerekir; demoda hazır uzman hesabı yoktur (aşağıda "bilinen eksikler").

## Demo verisi (hepsi "Örnek veri")

- 2 tarla: Burç Köyü Antep fıstığı (Şehitkamil), Yayla zeytinliği (Nizip).
- Don uyarısı: hava sağlayıcısı örnektir, topluluk üyelerinin hepsi -6 °C verir; Antep fıstığı çiçeklenme eşiği (-2 °C) örnek olarak onaylı sayılır. Zeytinde onaylı eşik olmadığından uyarı çıkmaz (bilinçli: onaysız veri uyarı üretmez).
- Duyuru: Gaziantep İl Tarım ve Orman Müdürlüğü (örnek), onaylı.
- Pazar: kayıtlı örnek borsa bülteni, tarihi bugüne çevrilmiş.
- Pusula AI: gerçek model yok; sahte sağlayıcı yalnız onaylı örnek belgelerden ve araç sonuçlarından cevap kurar.
- Sulama: sanal ESP32 (vana kapalı), yerel süreç içi mesaj aracısı.
- Takvim: 3 taslak iş şablonu (örnek).

## Bilinen eksikler (G15 devir notlarından)

- Panelde reddet / geri çek / duyuru düzenle / MFA sıfırla ekranları yok (yalnız API'de var).
- Demoda uzman hesabı hazır değil: onay gerektiren akışlar (paket onayı, yeni duyuru onayı) uçtan uca gezilemez. Hazır duyuru ve paketler zaten onaylıdır.
- G9 bağlama işleri yok: sulama ekranındaki "Pusula önerisi" kartı hâlâ "henüz yok", günlük toplam sulama sınırı yok.
- Takvim şablon verisi (`data/takvim_sablon.csv`) boş; demodaki 3 iş örnek kayıttır.
- Görsel karşılaştırma yalnız 5 ekranda ve düzen düzeyinde yapıldı.
- Gerçek servislerle denenmedi: canlı hava (Open-Meteo), canlı uydu (Copernicus), gerçek fiyat kaynakları, gerçek Claude, gerçek MQTT/saha ağı, SMS, bildirim (push).
- Cihaz (iOS/Android) denemesi yok; demo yalnız tarayıcıda. Sesle sor yalnız web tarayıcısında.
- Harita karoları internetten gelir (EOX uydu karosu); internet yoksa harita boş görünür, lisansı yayında doğrulanmalı.
- Demo verisi bellektedir; sunucu kapanınca eklediğiniz tarlalar silinir.

## Not alma

Beğenmediğiniz yeri ekran adı + ne beklediğinizle yazın (ör. "Bugün: don kartı yazısı uzun"). Bu notlar bir sonraki görevin girdisidir.
