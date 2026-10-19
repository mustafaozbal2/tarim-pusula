# Tarım Pusula 2.0 — Analiz, Mimari ve Faz Planı

Hazırlayan: Claude · Tarih: 19 Ekim 2026 · Durum: **Taslak v1 — onayına sunuldu**

Bu belge, yüklediğin tüm dosyaların (Proje Detay Raporları, sunum metni, duyuru/içerik giriş dosyaları, Antep fıstığı final raporu, WiseCrop ve TeknoEdu raporları) ve yaptığım araştırmanın sonucudur. Depoya `docs/PLAN.md` olarak konulabilir; Claude Code bunu "tek doğru kaynak" olarak okuyabilir.

> **Dürüstlük notu (okunan/okunamayan):**
> - Okunan: 5 docx, 5 PDF (metin katmanı), PPTX metni. Antep fıstığı "bol olsun" PDF'i ve PPTX'teki görseller metin içermiyor; **görsellerin içine henüz tek tek bakmadım** (sonraki adım).
> - YouTube videolarının içeriğine erişemedim, yalnızca başlık/açıklamasını okudum (Tabit Akıllı Çiftçi, Case IH Tarlam Cepte, Turkcell Filiz). `fb.watch` bağlantısı açılmadı. Bu uygulamaları ayrıca mağaza sayfalarından inceleyeceğim.
> - Tarım Cebimde'yi Hürriyet/Habertürk/haber siteleri üzerinden inceledim, uygulamanın kendisini kurup denemedim.

---

## 1. Mevcut projenin özeti (belgelerden çıkarım)

**Ne vardı:** Laravel 9 (Midone teması) + MySQL 8, 11 kullanıcı türü (admin, 5 kurum paneli, 5 kullanıcı paneli), MIT App Inventor mobil uygulama, WeMos D1 (ESP8266) + SHT31 + kapasitif toprak nem + yağmur sensörü ile prototip sulama. "Ay Yıldız Modeli": 5 kurum (Bakanlık, İl/İlçe Müdürlükleri, Üniversiteler, Araştırma Enstitüleri, Danışmanlık Şirketleri) yıldız, üreticiler hilal.

**Sulama mantığı (sunumdan):** Bitki katsayısı (Kc), tarla kapasitesi, solma noktası ve çiftçinin ayarladığı **Ry** değişkeni. Bu, FAO-56 yöntemindeki *kullanılabilir su* ve *izin verilen tükenme oranı (p)* mantığıyla birebir örtüşüyor. Yani temel bilimsel olarak sağlam; sadece sensöre bağlı "eşik" mantığından **su bütçesi (water balance) modeline** yükseltmek gerekiyor (bkz. §6).

**Jüri geri bildirimi:** "Bakanlık benzer sistemi uygulamaya aldı" ifadesi zayıf yön olarak yazılmış. Bunu kapatmanın yolu, Bakanlığın yapmadığı şeyi merkeze koymak (bkz. §3).

**Altın bilgi kaynağı:** Fıstık final raporu ve içerik girişi dosyaları (gübreleme, budama, sulama, tozlaşma, var/yok yılı, zararlılar, çeşitler, toprak örneği alma) birer **uzman bilgi tabanı**. Bunlar yapay zekânın ilk eğitim/RAG kaynağı olacak.

---

## 2. Rakip ve benzer uygulama analizi

| Uygulama | Güçlü yan | Zayıf yan / bizim fırsatımız |
|---|---|---|
| **Tarım Cebimde** (T.C. Tarım ve Orman Bak.) | Resmî, e-Devlet/ÇKS entegrasyonu, hayvan/balıkçılık/kent tarımı modülleri; **yeni "Tarımsal Sulama" modülü** (il/ilçe/mahalle, ürün, toprak, sulama yöntemi girilince 30 yıllık meteorolojik veriden sulama programı üretiyor) | Genel hizmet uygulaması; sensör/uzaktan eyleyici, yapay zekâ asistan, bölgeye özel haber toplama, pazar fiyatı görünmüyor. **Not:** "Sulama takvimi" artık tek başına özgün değil, farkımız *kapalı döngü + canlı uzaktan kontrol + AI* olmalı. |
| **Tabit** | 1,4 milyon çiftçiye ulaşım iddiası, SMS/IVR/mobil, eğitim odaklı | Kişiselleştirilmiş karar desteği ve IoT yok |
| **Turkcell Filiz** | NB-IoT ile tarla verisi | Donanım satışına bağlı, kapalı ekosistem |
| **Case IH Tarlam Cepte** | Makine/ekipman ekosistemi | Marka odaklı |
| **İmece, Akıllı Çiftçi** (raporlarınızda) | Ticari ürün/hizmet satışı | Karar desteği sınırlı |
| **Plantix** (Hindistan merkezli, dünya genelinde) | Fotoğraftan hastalık/zararlı tespiti, topluluk | Türkiye'ye ve fıstık/zeytine özel değil |
| **FarmLogs, Cropwise, Farmonaut** | Uydu (NDVI) tarla izleme, kayıt defteri | Türkçe/yerel mevzuat/destekler yok |
| **Hollanda: Akkerweb / FarmMaps (Wageningen + Agrifirm), AgROS "farmer data space"** | Çiftçi kendi verisini kontrol eder, kurumlarla paylaşır; uygulamalar bir platform üzerinde | Bizim Ay Yıldız modelimizin dünyadaki en yakın akrabası. **Çiftçi veri egemenliği** ilkesi alınmalı. |

**Çıkarım:** Türkiye'de "bölgeye + ürüne özel, güvenilir kaynaklı, AI destekli, sahadaki cihazı da çalıştıran tek ekran" boşluğu hâlâ açık.

---

## 3. Farklılaşma stratejisi (jüri için "neden bu proje")

1. **Kapalı döngü:** Veri → karar → eylem (İstanbul'dan basılan butona Gaziantep'te su akması). Rakiplerin çoğu sadece bilgi veriyor.
2. **Kaynak gösteren yapay zekâ ("Pusula AI"):** Her cevap kaynağıyla (kurum, tarih, bağlantı) gelir. Kaynak yoksa "bilmiyorum, uzmana sor" der. Jüride en güçlü güven argümanı.
3. **Otomatik güvenilir içerik hattı:** Resmî sitelerden duyuru/haber toplanır → bitki/konum etiketlenir → uzman onayıyla çiftçinin takvimine düşer (Ay Yıldız modelinin otomasyonu).
4. **Matematiksel temel:** FAO-56 su bütçesi, derece-gün (GDD) fenoloji, topluluk ensemble olasılığıyla don riski, çok kriterli ürün uygunluk skoru (bkz. §6). Jüriye "tahmin" değil **formül + doğrulama** sunarız.
5. **Çiftçi veri egemenliği (Hollanda'dan):** "Veri Cüzdanı": çiftçi hangi kuruma hangi veriyi verdiğini görür, kapatır, dışa aktarır, siler.
6. **Çevrimdışı ve düşük okur-yazarlık dostu:** Sesli soru, sesli cevap, büyük butonlar, görselli kutu kutu anlatım.
7. **Ölçülebilirlik:** Pilot bahçede su tasarrufu %, ET₀ doğrulaması (MGM istasyonuna karşı), AI doğruluk testi (ziraat mühendisinin notladığı 200 soruluk set), komut gecikmesi p95.

---

## 4. Ürün kapsamı (modüller)

**A. Çekirdek**
- Kayıt/giriş: telefon + SMS OTP (TC kimlik no **toplamayın**, bkz. §9)
- Arazi: harita üzerinde parsel çizme, alan hesabı, ürün/çeşit/dikim yılı, toprak tipi, sulama yöntemi, fotoğraf/not
- Çoklu arazi, çoklu kullanıcı (aile/işçi/danışman rolü ile paylaşım)
- Hava durumu: saatlik/günlük, 16 gün, parsel noktasına özel; don/dolu/fırtına/sıcak dalgası uyarıları
- Kişisel faaliyet takvimi (duyurular + fenolojiye göre otomatik görevler)
- Bildirim (push, SMS yedeği)

**B. Pusula AI (beyin)**
- Metin + ses + fotoğraf ile soru; cevap kartları (adım adım, görselli, YouTube videosu önerili)
- Bağlam bilir: hangi arazide, hangi ürün, hangi evre, bugünkü hava
- Kaynaklı cevap (RAG) + uzman onaylı cevap önbelleği
- "Uzmana Sor" ile devir (insan ziraat mühendisi)

**C. Bilgi kütüphanesi**
- Kitaplar/raporlar (fıstık, zeytin, üzüm…), bitki akademisi, "Yanlışı/Doğrusu", "Püf noktası" kartları
- Telif kontrolü: yalnızca yayın hakkı açık olan veya izin alınan içerik; diğerleri için özet + kaynak bağlantısı

**D. Akıllı sulama ve cihazlar**
- Cihaz ekleme (QR ile eşleştirme), canlı durum, uzaktan başlat/durdur, zamanlama, otomatik mod
- Kural motoru: "toprak nemi < X ise sula", "yağmur ihtimali > %60 ise ertele"
- Sulama geçmişi, su tüketimi, tasarruf raporu
- Genişleyebilir cihaz modeli: sensör, vana, pompa, hava istasyonu, ilerde drone/ilaçlama

**E. Pazar**
- Güncel hal/borsa fiyatları, 30/90/365 gün trend, bölgeler arası fiyat farkı
- "Nerede satarım" (en yakın hal/borsa/kooperatif/depo) ve tahmini net kazanç hesaplayıcı
- Arz-talep ve ekim bildirimi (sizin Tarımsal Üretim Planlama fikriniz)

**F. Karar destek**
- Ürün/çeşit önerisi (5 yıllık iklim normali + toprak + rakım + ekonomik getiri)
- Verim haritası, destek/hibe eşleştirme ("sana uyan destekler")
- Maliyet-gelir defteri, hasat kaydı

**G. Kurum panelleri (web)**
- Ay Yıldız'daki 5 kurum + admin: içerik girişi, hedefli duyuru (il/ilçe/köy/ürün), onay kuyruğu, soru yanıtlama, bölge analitiği (anonim/toplu)

---

## 5. Teknoloji kararı (önerim ve gerekçe)

**Önerilen yığın**

| Katman | Seçim | Neden |
|---|---|---|
| Mobil + web uygulama | **Expo (React Native) + TypeScript** | Tek kod tabanı: iOS, Android, ve web (masaüstü PWA). Backend ile aynı dil/şema (Zod) → Claude Code için daha az hata. OTA güncelleme (mağaza onayı beklemeden). |
| Kurum/admin paneli | **Next.js (TypeScript)** | Tablolu/formlu yoğun ekranlar için web en doğrusu |
| Backend | **NestJS (TypeScript), modüler monolit** | Başlangıçta mikroservis karmaşıklığı yok; modüller sınırlı olduğundan sonra ayrılabilir |
| Veritabanı | **PostgreSQL + PostGIS + pgvector (+ TimescaleDB)** | Konum/parsel (PostGIS), AI arama (pgvector), sensör zaman serisi (Timescale) tek veritabanı ailesinde |
| Kuyruk/iş | **Redis + BullMQ** | Veri toplama, bildirim, zamanlanmış sulama |
| AI | **Claude API (tool-use) + RAG** | Kaynaklı cevap, görsel anlama, araç çağırma (hava, takvim, fiyat) |
| ML (gerektiğinde) | **Python FastAPI mikroservis** | Ürün verim modeli gibi bilimsel iş yükleri için |
| IoT | **ESP32 + MQTT over TLS** (EMQX veya Mosquitto) | ESP8266'dan güçlü, TLS ve çoklu çekirdek, OTA |
| Depolama | S3 uyumlu nesne depolama | Fotoğraf, PDF |
| Altyapı | Docker + CI (GitHub Actions); AB/Türkiye bölgesi sunucu | KVKK ve maliyet kontrolü |

**Neden Flutter değil?** İkisi de iyi seçenek. Flutter görsel kontrol açısından güçlü ama dil Dart; backend ve panel ayrı dilde kalır. Tek dil (TypeScript) avantajını tercih ettim. **Bu karar senin; dilersen Flutter ile ilerleyebiliriz.**

**Neden Supabase/Firebase değil?** Hızlı olurlar ama veri konumu, KVKK ve uzun vadeli esneklik açısından kendi PostgreSQL'imizi tercih ettim. (Sonradan yönetilen Postgres'e taşımak kolay.)

**Neden App Inventor/Laravel'den ayrılıyoruz?** Ölçeklenebilirlik, güvenlik (rol/tenant yalıtımı), çevrimdışı çalışma ve AI entegrasyonu için. Mevcut veri modelleri (ürün objesi, takvim mantığı) yeni şemaya **taşınır**, sıfırdan atılmaz.

**Dış veri kaynakları (doğrulanması gerekenler işaretli)**
- Hava/ET₀/toprak nemi/toprak sıcaklığı/derece-gün: **Open-Meteo** (ET₀, 5 katmanlı toprak nemi, ensemble ve geçmiş arşiv API'leri var). *Ticari kullanım için ücretli lisans gerekir; yarışma/prototipte sorun yok. Lisans metnini ürünleşmeden önce doğrula.*
- Resmî uyarılar: MGM (resmî API/lisans durumu **doğrulanacak**; yoksa il müdürlüğü duyurusu + model olasılığı birlikte)
- Toprak: SoilGrids (WiseCrop'un da kullandığı), yükseklik: SRTM/Copernicus DEM
- Uydu: Sentinel-2 (Copernicus, ücretsiz) → NDVI
- Fiyat: İBB Hal Fiyatları web servisi (açık veri lisanslı, Swagger'lı); Gaziantep/diğer ticaret borsaları ve TMO için **tek ulusal açık API görünmüyor** → adaptör + kurum panelinden elle giriş yedeği (Ay Yıldız mantığıyla uyumlu)
- Haber/duyuru: tarimorman.gov.tr, il/ilçe müdürlükleri, belediyeler, enstitüler (robots.txt ve kullanım şartları kontrolüyle; her kayıtta kaynak ve tarih)

---

## 6. Matematiksel ve geometrik temel

**6.1 Sulama (FAO-56 su bütçesi)**
- ETc = Kc × ET₀ (aşama bazlı Kc; kaynak FAO-56 Tablo 12, fıstık/zeytin değerlerini enstitü ile **doğrulayarak** gireceğiz)
- Toplam kullanılabilir su: TAW = 1000 · (θFC − θWP) · Zr   [mm]
- Hemen kullanılabilir su: RAW = p · TAW  (**p = sizin "Ry" değişkeninizin bilimsel karşılığı**, aşamaya göre ayarlanır)
- Günlük tükenme: Dr,i = Dr,i−1 − (P − RO) − I − CR + ETc + DP
- Karar: Dr ≥ RAW ise sula. Net derinlik = Dr; damla için süre = (derinlik × alan) / (damlatıcı sayısı × debi × verim)
- Stres katsayısı: Ks = (TAW − Dr) / ((1 − p) · TAW), ETc,adj = Ks · Kc · ET₀
- Sensör varsa model, ölçümle **kalibre edilir** (Kalman/EMA düzeltmesi); sensör yoksa model tek başına öneri verir.
- Yağış tahmini: ensemble olasılığı ve beklenen miktar ile sulama ertelenir.

**6.2 Fenoloji ve takvim**
- Derece-gün: GDD = Σ max(0, (Tmax + Tmin)/2 − Tbase). Takvim "tarihe" değil **bitkinin evresine** bağlanır.
- Soğuklama ihtiyacı: soğuklama saati / dinamik model (fıstık için kritik, final raporu ve içerik dosyanızda var).
- Zararlı (ör. psillid, zeytin güvesi) için derece-gün temelli uyarı + feromon tuzağı sayımları (kurum girer).

**6.3 Don riski (olasılıksal)**
- P(don) = ensemble üyelerinden Tmin ≤ T_kritik(evre) olanların oranı. Kritik sıcaklık evreye göre değişir (tomurcuk kabarması vs çiçeklenme).
- Mikro-iklim düzeltmesi: Δ yükselti × 6,5 °C/km (DEM'den) ve çukur/don cebi bilgisi.

**6.4 Ürün uygunluk skoru**
- Her faktör (sıcaklık, soğuklama, yağış, pH, derinlik, drenaj, rakım) için yamuk üyelik fonksiyonu f_i ∈ [0,1] (FAO EcoCrop mantığı)
- Skor = (Π f_i^{w_i})^{1/Σw_i}  → bir faktör sıfırsa ürün elenir (Liebig minimum yasası)
- Ekonomik katman: beklenen brüt kâr = verim × fiyat − değişken maliyet; fiyat ve verim için aralık (P10–P90) gösterilir, tek sayı değil.
- Makine öğrenmesi, ancak doğrulanabilir yeterli veri olursa (TÜİK il verimi + iklim) eklenir; önce şeffaf skor.

**6.5 Geometri (PostGIS)**
- Parsel alanı: `ST_Area(geography)`; mesafe: `ST_Distance`; hedefli duyuru: parselin il/ilçe/mahalle poligonuyla kesişimi (`ST_Intersects`)
- Sensör enterpolasyonu: IDW; sulama bölgesi (zone) ayrıştırması: Voronoi

**6.6 Doğrulama (jüriye sunulacak)**
- ET₀: Open-Meteo vs MGM Gaziantep istasyonu (RMSE, MAE)
- Sulama modeli: pilot bahçede model önerisi vs sensör; su tasarrufu %
- AI: 200 soruluk uzman notlu test; doğruluk, kaynak oranı, "bilmiyorum" oranı
- IoT: komut→vana gecikmesi p95, başarısız komut oranı

---

## 7. IoT mimarisi ve güvenlik (uzaktan sulama)

**Akış:** Uygulama → API (yetki kontrolü) → komut kaydı → MQTT `dev/{id}/cmd` → ESP32 → `dev/{id}/ack` → API → uygulama (canlı durum).

**Güvenlik kuralları (ilk gün):**
1. Her cihazın **kendine özel kimliği** (cihaz başına sertifika veya anahtar); ortak şifre yok. MQTT TLS zorunlu.
2. Cihazlar sadece kendi konularına yayın/abone olur (topic ACL).
3. Komutu *kimin* verdiği her seferinde **sunucuda** doğrulanır: kullanıcı ∈ arazi sahipleri/yetkilileri. İstemciye güvenilmez. Başkasının suyunu başlatma riski burada kapanır.
4. Komut kısa ömürlü (TTL), tekil kimlikli (idempotent), cihaz **ack** dönmeden "başladı" denmez.
5. **Cihazda sert güvenlik sınırı:** Maksimum çalışma süresi (ör. 30 dk) bağlantı kopsa bile pompayı kapatır; yağmur sensörü ve düşük su seviyesi korumaları donanımda kalır.
6. Tüm komutlar denetim kaydına (kim, ne zaman, hangi cihaz, sonuç).
7. Cihaz yazılım güncellemesi imzalı OTA.
8. Hız sınırı, anormal kullanım uyarısı.

**Canlı jüri demosu için:** İstanbul'dan basma → Gaziantep'te akış; video görüşmede gösterim. Yedek plan: yerel LTE modem/ikinci hat, ayrıca önceden kayıt altına alınmış video.

---

## 8. Yapay zekâ tasarımı (sistemin beyni)

- **RAG:** Fıstık raporu, içerik dosyaları, resmî duyurular, kitaplar → parçalara ayrılır, bitki/konum/tarih/kaynak etiketiyle `pgvector`'a kaydedilir.
- **Araçlar (tool-use):** `hava_getir`, `takvim_getir`, `arazi_getir`, `fiyat_getir`, `kütüphane_ara`, `video_öner`, `uzmana_yönlendir`. Model rakamı uydurmaz, araçtan alır.
- **Cevap biçimi:** Kısa özet → adım kartları (fotoğraf/şema) → ilgili video → kaynak. Çiftçi okumaz, gösterilir.
- **Güvenlik/sorumluluk:** İlaç dozu ve ruhsatlı ürün konusunda yalnızca resmî etiket/Bakanlık tavsiyesini aktarır, kendi dozunu üretmez; riskli konularda uzman onayı rozeti.
- **Kalite:** Kaynaksız cevap yok; güven skoru düşükse "uzmana sor"; kullanıcı geri bildirimi (👍/👎) uzman kuyruğuna düşer.
- **YouTube:** Kurum/uzman onaylı kanal ve video listesi (küratörlü); model yalnızca bu listeden önerir.
- **Maliyet kontrolü:** Sık sorulan uzman onaylı cevaplar önbelleğe alınır.

---

## 9. Güvenlik, gizlilik, hukuk

- **KVKK:** Veri minimizasyonu. TC kimlik no'yu **toplamayın** (önceki sürümde toplanıyordu); telefon OTP yeter. ÇKS/e-Devlet entegrasyonu Bakanlık izni gerektirir, sonraya bırakılır.
- Rol modeli (RBAC) 11 kullanıcı türünü karşılar + **satır düzeyinde yalıtım (RLS)** savunma katmanı.
- Kurum kullanıcıları için 2 aşamalı doğrulama (MFA); admin işlemleri denetim kaydında.
- Parola/anahtar yönetimi, şifreli yedek, sızma testi kontrol listesi (OWASP ASVS, MASVS).
- İçerik toplama: robots.txt, kullanım şartları ve telif; kaynağa atıf her zaman.
- Konum verisi hassas: yalnızca gereken hassasiyette, kullanıcı kontrolünde paylaşım.

---

## 10. Tasarım ilkeleri ("sade ama mükemmel")

- Ana ekran 3 soruya cevap verir: **Bugün ne yapmalıyım? Hava/risk ne? Tarlam iyi mi?**
- Büyük dokunma alanları, yüksek kontrast, açık/koyu tema (güneş altında okunabilirlik), 2 dokunuşta her işlem.
- Dil: sade Türkçe; teknik terim yanında açıklama; sesli oku.
- Kart tabanlı, görsel öncelikli anlatım; metin duvarı yok.
- Marka dili: toprak/yeşil/altın (fıstık) paleti, hilal-yıldız motifini ince bir imza olarak.
- Erişilebilirlik (WCAG AA), düşük bant genişliği ve çevrimdışı mod.
- Tasarım sistemi (renk, tipografi, boşluk, bileşen) ilk görevde kurulur; sonraki her ekran buna uyar.

---

## 11. Ek önerilerim (jüride puan getirebilecekler)

1. **Uydu tabanlı bitki sağlığı (NDVI):** Sentinel-2 ile parsel sağlık haritası, düşüş uyarısı (ücretsiz veri).
2. **Fotoğraftan teşhis:** Yaprak/gövde fotoğrafı → olası sorun + güven oranı + uzman doğrulaması. (Sonuç "kesin teşhis" olarak sunulmaz.)
3. **Çiftçi Veri Cüzdanı** (Hollanda modeli): izin ver / geri çek / dışa aktar / sil.
4. **Püskürtme penceresi:** Rüzgâr, yağış, sıcaklık ve arı aktivite saatlerine göre "bugün ilaçlama uygun mu?" (duyurularınızdaki arı/saat kuralı ile uyumlu).
5. **Tarla defteri:** Tüm işlemler (gübre, ilaç, sulama, hasat) tek kayıt; "İyi Tarım" / destek başvurusuna aktarım.
6. **Var-yok yılı yönetimi (fıstık):** Önceki yıl verimine göre besleme/budama önerisi (final raporunuzdaki periyodisite bilgisi).
7. **Sensör kural motoru + olay yolu:** drone, ilaçlama robotu, hava istasyonu aynı cihaz modeline bağlanır ("kollar her yana açık").
8. **Toplu ekim bildirimi (crowdsourcing):** Üretim planlamanın orijinal fikri; anonim toplulaştırma ile bölgesel arz tahmini.
9. **SMS/WhatsApp yedek kanalı:** Akıllı telefonu olmayan veya internet kısıtlı çiftçiye kritik uyarı.
10. **İklim ve su ayak izi raporu:** Tasarruf edilen su → SKH (sürdürülebilirlik) göstergesi.
11. **Kooperatif/danışman çoklu çiftlik görünümü:** Bir uzman yüzlerce çiftçiyi tek ekrandan izler (B2B gelir modeli).

---

## 12. Faz planı (Claude Code için görev paketleri)

Tek seferde hepsini yaptırmanın riski: bağlam taşar, test edilmeyen büyük kod yığını oluşur. Bu yüzden **dikey dilimler** halinde, her görevin sonunda çalışır + testli bir sürüm olacak şekilde bölüyorum.

| Faz | Görev | Çıktı / kabul ölçütü |
|---|---|---|
| **0 Temel** | G0: Monorepo, CI, Docker, lint/test, tasarım sistemi, `CLAUDE.md` | `pnpm test` yeşil; boş uygulama iOS/Android/web'de açılıyor |
| | G1: Veritabanı şeması + migrasyon, auth (OTP), RBAC, RLS, denetim kaydı | Yetkisiz erişim testleri geçiyor |
| **1 Çekirdek** | G2: Arazi (harita/parsel/alan), ürün/çeşit/evre katalogları | Parsel çiz→alan doğru (birim testi) |
| | G3: Hava servisi (Open-Meteo) + ET₀ + don olasılığı + bildirim | ET₀ doğrulama betiği, don uyarısı simülasyonu |
| | G4: Takvim + duyuru motoru + hedefleme (il/ilçe/köy/ürün) | Fıstık/zeytin örnek içeriği doğru çiftçiye düşüyor |
| | G5: Kurum paneli (içerik girişi, onay kuyruğu) | 5 kurum rolü ayrı ekranlar |
| **2 Beyin** | G6: Bilgi kütüphanesi + RAG altyapısı (PDF → parça → vektör) | Kaynak gösterimli cevap |
| | G7: Pusula AI sohbet (araçlar, kartlar, ses, video, uzmana devir) | 200 soruluk test seti çalışıyor |
| **3 Sulama** | G8: Cihaz kaydı, MQTT, komut/ack, güvenlik, ESP32 yazılımı | Uzaktan başlat/durdur; yetkisiz deneme reddi |
| | G9: Su bütçesi motoru + otomatik mod + kural motoru | Simüle edilmiş hafta, model beklenen sulamayı üretir |
| **4 Pazar/Karar** | G10: Fiyat toplayıcılar + pazar ekranı + net kazanç hesabı | İBB hal verisi canlı, fıstık/zeytin kurum girişi |
| | G11: Ürün uygunluk skoru + verim haritası + destek eşleştirme | Skor açıklanabilir, formül gösterilir |
| **5 Genişleme** | G12: Otomatik içerik toplama hattı (kaynak→etiket→onay) | Onaylı içerik takvime düşer |
| | G13: NDVI, foto teşhis, tarla defteri, veri cüzdanı | — |
| | G14: Güvenlik sertleştirme, performans, mağaza yayını | Sızma testi listesi, p95 hedefleri |

Her görev için ben **ayrıntılı iş tanımı (kabul ölçütleri + test listesi)** yazıp GitHub'a koyarım; sen Claude Code'a "G3'ü yap" dersin.

---

## 13. Riskler

| Risk | Önlem |
|---|---|
| "Bakanlık zaten yapıyor" eleştirisi | §3 farklılaşma; Tarım Cebimde'yi rapor ve sunuda açıkça kıyasla |
| AI yanlış tavsiye (ilaç/gübre) | Kaynak zorunluluğu, doz üretmeme, uzman onayı |
| Canlı demo internet/donanım arızası | Çift hat, önceden kayıt, cihazda güvenli çalışma sınırı |
| Telif (kitap/rapor) | İzin/atıf; özet + bağlantı; kurumsal iş birliği |
| Veri kaynağı değişimi/kapanması | Adaptör katmanı, önbellek, elle giriş yedeği |
| Ücretsiz API ticari sınırı | Prototipte uygun; ürünleşmede lisans/self-host |
| Kapsam şişmesi | Faz planı + her fazda "çalışan ürün" kuralı |

---

## 14. Senden beklediğim kararlar

1. **Teknoloji:** Expo/TypeScript önerimi uygun mu, yoksa Flutter mı?
2. **Pilot ürünler:** Başlangıçta Antep fıstığı + zeytin (+ başka?)
3. **GitHub:** Depo adı/hesabı (ben ekleyip planı yüklerim)
4. **Eski kod/veritabanı:** Laravel kodu ve MySQL şeması var mı? Varsa paylaş, veri modelini taşırım.
5. **Donanım:** ESP32'ye geçiş uygun mu? Elinde hangi sensör/röle/pompa var?
6. **Takvim:** Teknofest başvuru/final tarihleri (görev sırasını buna göre kuracağım).
7. **Ekip:** Kurum içeriğini kimler girecek (İbrahim hoca, ziraat mühendisi)? AI doğruluk testini notlayacak uzman kim?

---

*Kaynaklar (araştırma):* Tarım Cebimde — [Hürriyet](https://www.hurriyet.com.tr/ekonomi/tarim-cebimdeye-yeni-moduller-geldi-42248830), [Habertürk](https://www.haberturk.com/yerli-ve-milli-uygulama-tarim-cebimde-3552561-teknoloji), [Tarımsal Sulama modülü](https://www.benguturk.com/ekonomi/tarim-cebimde-uygulamasina-tarimsal-sulama-modulu-eklendi-148337h) · [Open-Meteo dokümantasyonu](https://open-meteo.com/en/docs) · [İBB Hal Fiyatları Web Servisi](https://data.ibb.gov.tr/en/dataset/hal-urunleri-ve-fiyatlari-web-servisi) · [Wageningen AgROS](https://wur.nl/en/show/6.-agros-farmer-data-space.htm) · [FarmMaps/Akkerweb](https://www.hortidaily.com/article/6024685/dutch-agriculture-data-platform-launched/) · [TRT Haber: Batmanlı öğrencilerin akıllı sulama projesi](https://www.trthaber.com/haber/guncel/akilli-sulama-sistemi-gelistiren-batmanli-ogrenciler-teknofestte-ucuncu-oldu-765300.html) · Plantix: [FAO e-Agriculture](https://www.fao.org/e-agriculture/fr/node/13281) · FAO-56 (Allen vd., 1998) yöntemi.
