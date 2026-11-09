# Mağaza metni: Tarım Pusula

**Ad (≤30):** Tarım Pusula
**Kısa açıklama (≤80):** Çiftçiye hava, don uyarısı, iş takvimi ve resmî duyurular tek yerde.
**Kategori:** Ev ve Gelir Kaynağı > uygun değilse "Araçlar" (Play Console'da "Tarım" kategorisi yoksa Araçlar). Etiketler: hava durumu, tarım, takvim.
**Hedef kitle:** 18 yaş ve üzeri (çiftçiler). 13 yaş altı hedeflenmez; Aile programına girilmez.
**İletişim e-postası / web sitesi:** [yayın öncesi doldurulacak] / site adresi
**Gizlilik politikası:** `/gizlilik.html` · **Hesap silme:** `/hesap-sil.html`

**Uzun açıklama**
Tarım Pusula, çiftçinin arazisine göre çalışan sade bir yardımcıdır. Arazini ekle; hava, gece don uyarısı, iş takvimi ve sana uygun resmî duyurular ana sayfada toplansın.

- Bu gece don var mı? Arazinde en düşük sıcaklık ve saat aralığı, saatlik grafikle. Bildirim ve SMS ile haber verir.
- Kar, kuvvetli rüzgâr ve şiddetli yağış uyarıları.
- Tüm arazilerin tek ana sayfada: haberler, işler ve uyarılar arazi değiştirmeden görünür.
- İş takvimi ve kendi notların: işine 2 gün, 1 gün kala ve o gün hatırlatma.
- İl ve ilçe tarım müdürlüklerinin duyuruları (hibe, destek, eğitim, mücadele). Kaynak ve tarih her zaman yazılıdır; süresi geçen duyuru kalkar.
- Pusula Yapay Zekâ: soru sor, bitkinin fotoğrafını gönder, sesle sor. Geçmiş sohbetlerin kayıtlıdır.
- Uzmana sor: sorunu ziraat uzmanına ilet.
- Verilerin sende: Veri cüzdanından indir, hesabını tek dokunuşla sil.

Önemli: Tarım Pusula resmî bir kurum uygulaması değildir. Yapay zekâ yanıtları uzman cevabı değildir, hata içerebilir; ilaç dozu ve karışım oranı vermez, bunun için ziraat mühendisine ve ürün etiketine danış. Hava tahminleri Open-Meteo ve MET Norway verisidir; tahminler kesin değildir. Uzman onayı bekleyen bilgiler rozetle işaretlenir ve uyarı olarak sunulmaz.

**İzin gerekçeleri (mağaza ve uygulama içi açıklama)**

| İzin                                                                                                                                           | Neden                                                 | İstenen an                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------- |
| Konum                                                                                                                                          | Arazinin yerini bulmak. Arka planda izlenmez.         | Arazi eklerken "Tarladayım" |
| Kamera / fotoğraf                                                                                                                              | Bitki fotoğrafı göndermek                             | Soru sorarken               |
| Mikrofon, konuşma tanıma                                                                                                                       | Sesle soru sormak; kayıt saklanmaz                    | Mikrofon düğmesine basınca  |
| Takvim                                                                                                                                         | Faaliyetleri telefon takvimine eklemek (isteğe bağlı) | "Takvime ekle"              |
| Bildirim                                                                                                                                       | Don, duyuru ve not hatırlatmaları                     | İlk açılış                  |
| İnternet                                                                                                                                       | Sunucuyla iletişim                                    | -                           |
| Kullanılmayan ve çıkarılan: REQUEST_INSTALL_PACKAGES, SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE (Play sürümü), READ_CONTACTS, READ_SMS. |

**Ekran görüntüleri (8, Türkçe, telefon):** sürüm hazır olunca gerçek cihazdan alınacak: 1 ana sayfa (haber şeridi ve alt çubuk), 2 gece don kartı, 3 "Neler yapabilirim?" bilgi notu, 4 takvim ve not, 5 Pusula Yapay Zekâ sohbeti, 6 yan menü, 7 hava, 8 Veri cüzdanı ve Hesabı sil. Not: telefon kablosuz hata ayıklaması açık olmadığından bu turda alınamadı; cihaz bağlanınca `adb exec-out screencap -p` ile 1080x1920 alınır. Hazır varlıklar: `simge-512.png`, `one-cikan-1024x500.png`.
