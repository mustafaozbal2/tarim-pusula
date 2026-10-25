# Tarım Pusula — Plan v2

Hazırlayan: Claude · 19 Ekim 2026 · Önceki sürüm: `TARIM_PUSULA_2_PROJE_PLANI.md` (v1)

**v1'den farklar (kararların ve yeni bulguların işlenmesi):**

- Teknoloji kararı verildi: **Expo (React Native) + TypeScript**. Flutter seçeneği kapandı.
- Kapsam: **tüm ürünler** baştan kapsamda (pilot ürün yok). Bu, veri modelini "ürün-bağımsız" kurmayı gerektiriyor (§4).
- Sıfırdan başlıyoruz: eski kod/şema yok.
- **Sulama donanımı en sona**: yazılım önce. Donanım yokken geliştirebilmek için **sanal cihaz simülatörü** ekledik (§7).
- Görseller incelendi, araştırma genişletildi (MGM, Teknofest takvimi, BKÜ, Sentinel, yapay zekâ danışmanlığı dersleri, Wageningen).
- Plan, haftalık takvime bağlandı (§10).

---

## 0. Önemli bulgular (kısa)

| #   | Bulgu                                                                                                                                                                                                                                                       | Etkisi                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **MGM'nin açık API'si görünmüyor ve sitedeki içerik izinsiz kopyalanamıyor/yeniden yayımlanamıyor; atıf zorunlu.**                                                                                                                                          | MGM verisini otomatik çekmeyeceğiz. Sayısal tahmin için Open-Meteo; resmî uyarılar için il müdürlüğü duyuruları + MGM'ye **resmî izin başvurusu** (KEP). Jüri için de "hukuka uygun veri" puan getirir. |
| 2   | **Bitki Koruma Ürünleri (BKÜ) veri tabanı** Bakanlıkta var (ruhsatlı ürün, tavsiye arama, yasaklı aktif madde Excel'i). API bulamadım.                                                                                                                      | Yapay zekâ ilaç/doz **uydurmaz**; BKÜ'ye yönlendirir. Yasaklı aktif madde listesi (Excel) ile otomatik güvenlik kontrolü yaparız.                                                                       |
| 3   | **Tarım Cebimde** sulama modülü: sulama programını 30 yıllık veriyle çıkarıyor; sizin slayttaki gibi ürün başına **tek sabit Kc** yerine biz **evreye göre Kc** kullanacağız.                                                                               | Sulamada bilimsel derinlik farkımız.                                                                                                                                                                    |
| 4   | FAO-56 Tablo 12'den **meyve ağaçları, tahıl, sebze, baklagil için Kc değerlerini doğrulayarak aldım** (`kc_fao56_seed.csv`). Zeytin, fıstık, badem, ceviz, üzüm, narenciye dahil. İncir ve nar tabloda bulunmadı.                                           | Tüm ürün kapsamının ilk tohum verisi hazır; uzman onayı bekliyor.                                                                                                                                       |
| 5   | Sentinel-2 NDVI: Copernicus **Statistical API** ile poligon bazında zaman serisi alınabiliyor (OAuth istemcisi gerekir). Ücretsiz kota koşullarını doğrulamadım.                                                                                            | Parsel sağlık haritası mümkün.                                                                                                                                                                          |
| 6   | Yapay zekâ danışmanlığı (FarmerChat/Digital Green, Dünya Bankası): **ses**, yerel bağlam ve **insan denetimi** başarının anahtarı; halüsinasyon ciddi risk; çiftçiler en çok **fotoğrafla teşhis**, gübre, evreye özgü uygulama, hava ve **fiyat** soruyor. | Pusula AI'nın ilk günden ses + fotoğraf + fiyat + insan denetimi içermesi gerekiyor (§8).                                                                                                               |
| 7   | Wageningen yaklaşımı: arayüzler kullanıcıyla **birlikte tasarlanıyor**; öneriler **neden verildiğini açıklıyor** (açıklanabilir yapay zekâ).                                                                                                                | Her öneri kartında "Neden?" düğmesi (formül/kaynak).                                                                                                                                                    |
| 8   | **Parsel verisi:** TKGM'nin açık, resmî bir parsel API'sini bulamadım (yalnızca mobil uygulama/portal).                                                                                                                                                     | Çiftçi parseli haritada kendisi çizer; ada/parsel numarası isteğe bağlı alan. Resmî entegrasyon (ÇKS/TKGM) kurumsal izinle sonraya.                                                                     |
| 9   | **Teknofest takvimi:** 2026 yarışmasında son başvuru 28 Şubat 2026, ön değerlendirme formu 31 Mart, sunum 1 Temmuz, final 30 Eylül–4 Ekim (Şanlıurfa). Başvurular Ocak 2026'da açılmıştı. **2027 takvimi henüz yayımlanmamış görünüyor.**                   | "Aralık" kesin değil; Ocak–Şubat 2027 varsayımıyla geriye doğru plan yaptım (§10). Kesin tarih çıkınca güncelleriz. Üniversite ve üzeri/mezun kategorisi 2026'da 1. için 100.000 ₺.                     |
| 10  | Fıstık slaytı: Türkiye dikili alanda dünya payı **%35**, üretimde **%12**; ağaç başı verim ABD **17 kg**, Türkiye **4 kg**; örnek bahçeler 2013'te **93 kg/da**, komşu bahçeler **19 kg/da**.                                                               | Jüri sunumunda "problem" slaytı için hazır, güçlü rakamlar (kaynağını rapora yazarız).                                                                                                                  |

**Eksik kalan (dürüstlük):** Teknofest 2026 şartnamesinin puan ağırlıklarını okuyamadım (şartname PDF'sine erişim engelli). Fıstık için evreye özgü don eşiklerini doğrulayamadım; yalnızca zeytin için bir derlemeden değer aldım. İlgili alanlar uzman onayı bekliyor olarak işaretlenecek.

---

## 1. Ürün tanımı

> Tarım Pusula: çiftçinin cebindeki **ziraat mühendisi + hava durumu + pazar + defter + (ileride) uzaktan kumanda**. Slogan: **Bilinçli Tarım, Verimli Üretim.**

Hedef kullanıcı: çiftçi, hobi bahçesi sahibi, tarımsal işletme, kooperatif, danışman; kurum tarafında Bakanlık, il/ilçe müdürlükleri, üniversite, enstitü, danışmanlık şirketi (Ay Yıldız Modeli korunur).

**Marka:** Pusula logosu ve çiftçi karakteri korunur. Slaytlardaki yeşil, altın ve turkuaz dili modernize edilir (§9).

---

## 2. Neden farklı (jüri için)

1. **Kaynaklı yapay zekâ:** Her cevap kaynak + tarih + "Neden?" açıklaması taşır; bilmiyorsa söyler.
2. **Hukuka uygun, izlenebilir veri hattı:** Veri kaynakları lisanslı/izinli; kopyalamak yerine atıf ve bağlantı.
3. **Bilimsel çekirdek:** FAO-56 su bütçesi (evreye göre Kc), derece-gün fenolojisi, olasılıksal don riski, çok kriterli ürün uygunluğu.
4. **Çiftçi veri egemenliği (Hollanda AgROS/FarmMaps ilkesi):** Veri Cüzdanı.
5. **Erişilebilirlik:** Sesle soru-cevap, fotoğrafla soru, çevrimdışı çalışma.
6. **Genişleyebilir mimari:** Cihaz modeli ve kural motoru; sensör, drone, ilaçlama robotu sonradan eklenir.
7. **Ölçülebilir doğrulama:** ET₀ doğrulaması, AI test seti, sistem testleri (§6.6).

Tarım Cebimde'nin yaptığı genel hizmetleri (ÇKS, hayvan, balıkçılık) **yapmıyoruz**; onunla rekabet etmek yerine tamamlayıcıyız: "Bakanlığın uygulaması işlemleri yapar, Tarım Pusula karar verdirir."

---

## 3. Kapsam (A'dan Z'ye modüller)

**A. Hesap ve arazi**

- Telefon + SMS OTP (TC kimlik no toplanmaz). Profil, bölge, ilgi alanı.
- Parsel çizimi (harita), alan otomatik; çoklu arazi; ürün/çeşit/dikim yılı/sulama yöntemi/toprak; not ve fotoğraf; ekip üyesi ekleme (işçi, danışman).

**B. Hava, risk, uyarı**

- Parsel noktasına özel saatlik/günlük/16 gün tahmin; don, dolu, rüzgâr, sıcak dalga, yağış; ilaçlama penceresi.
- Bildirim: push ve (kritikte) SMS.

**C. Takvim ve duyurular**

- Ürün + konum + fenolojik evreye göre kişisel takvim; kurum duyuruları (hedefli: il/ilçe/köy/ürün); otomatik görevler.

**D. Pusula AI**

- Metin, ses, fotoğraf; araçlarla (hava, takvim, arazi, fiyat, kütüphane) çalışır; kaynaklı cevap; kutu kutu görsel kartlar; video önerisi; uzmana devir.

**E. Kütüphane**

- Kitaplar, raporlar, bitki akademisi, Yanlışı/Doğrusu, Püf Noktası; arama; çevrimdışı indirme; telif/atıf kaydı.

**F. Pazar**

- Güncel fiyat (kaynak ve tarih etiketli), trend, bölgeler arası fark, nerede satarım, net kazanç hesaplayıcı.

**G. Karar destek**

- Ne ekeyim (uygunluk + ekonomi), çeşit önerisi, verim haritası, destek/hibe eşleştirme, maliyet-gelir defteri, hasat kaydı, tarla defteri.

**H. Parsel sağlığı (uydu)**

- Sentinel-2 NDVI zaman serisi, anormal düşüş uyarısı.

**I. Cihazlar ve sulama (son faz, simülatörle başlar)**

- Cihaz ekleme, durum, uzaktan başlat/durdur, zamanlama, otomatik kurallar, sulama geçmişi.

**J. Kurum paneli (web)**

- İçerik girişi, onay kuyruğu, soru yanıtlama, bölge analitiği.

**K. Yönetim**

- Admin, denetim kaydı, içerik/kaynak yönetimi, AI kalite paneli (👍/👎, uzman puanı).

---

## 4. "Tüm ürünler" için veri mimarisi

Her ürünü koda gömmeyiz. Her ürün, sürümlü bir **Bitki Bilgi Paketi** olarak veritabanında tanımlanır:

```
Bitki (crop)
 ├─ ad, bilimsel ad, grup (tahıl, meyve ağacı, sebze, baklagil…), ömür (yıllık/çok yıllık)
 ├─ Çeşitler (varieties)
 ├─ Fenolojik evreler (stages): ad, GDD eşikleri (veya takvim), Kc (ini/mid/end → evre başına), kök derinliği,
 │                              don kritik sıcaklığı, kritik su evresi, bölgesel ofset
 ├─ İklim/toprak istekleri: yamuk üyelik parametreleri (sıcaklık, soğuklama, yağış, pH, derinlik, drenaj, rakım)
 ├─ Faaliyet şablonları: gübreleme, budama, ilaçlama pencereleri (kaynaklı)
 ├─ Zararlı/hastalık listesi (kaynaklı, BKÜ'ye bağlantılı)
 └─ Her alanda: kaynak, tarih, sürüm, onay durumu (taslak / uzman onaylı / kurum onaylı)
```

**Kural:** Onaysız (taslak) veri uygulamada gösterilir ama "uzman onayı bekliyor" rozetiyle; öneri/uyarıda **kullanılmaz** (yalnızca onaylı değerler karar üretir).

**İlk tohum verisi:** `kc_fao56_seed.csv` (FAO-56 Tablo 12'den doğrulanmış 33 satır). Eksik ürünler (incir, nar vb.) için FAO/TAGEM ve enstitü yayınlarından doldurulacak; yapay zekâ **taslak** doldurabilir ama onaysız kalır.

**Bölgesel uyarlama:** Bitki evre tarihleri ve Kc iklime göre değişir; paket "bölge ofseti" taşır ve il/ilçe uzmanı onaylar. Bu, Ay Yıldız modeliyle birebir uyumlu: bilgiyi kurumlar girer ve onaylar.

---

## 5. Teknoloji (kesinleşmiş)

| Katman                     | Seçim                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Mobil + web (masaüstü PWA) | **Expo (React Native) + TypeScript**, Expo Router                                      |
| Yerel veri / çevrimdışı    | SQLite (expo-sqlite) + senkron kuyruğu                                                 |
| Harita                     | MapLibre (açık kaynak) + açık harita altlığı                                           |
| Kurum/admin paneli         | **Next.js (TypeScript)**                                                               |
| API                        | **NestJS** modüler monolit, OpenAPI şeması, Zod doğrulama                              |
| Veritabanı                 | **PostgreSQL + PostGIS + pgvector** (+ TimescaleDB, cihaz fazında)                     |
| Kuyruk                     | Redis + BullMQ                                                                         |
| AI                         | **Claude API** (tool-use, görsel, ses metne dönüşüm ayrı servis) + pgvector RAG        |
| Bilimsel hesap             | Başlangıçta TypeScript kütüphanesi (`packages/agro-core`); ML gerekirse Python FastAPI |
| IoT                        | MQTT (EMQX/Mosquitto) + TLS, ESP32 (donanım gelince)                                   |
| Depolama                   | S3 uyumlu                                                                              |
| Altyapı                    | Docker, GitHub Actions CI, AB/Türkiye bölgesi                                          |
| Test                       | Vitest/Jest, Playwright (web), Maestro (mobil e2e)                                     |

**Monorepo yapısı (`tarim-pusula`):**

```
apps/mobile      Expo uygulaması (iOS, Android, web)
apps/panel       Next.js kurum/admin paneli
apps/api         NestJS
apps/workers     veri toplama, bildirim, zamanlanmış işler
packages/agro-core    FAO-56, GDD, don riski, uygunluk skoru (saf, test edilebilir, bağımsız)
packages/schemas      Zod şemaları (mobil, panel, API ortak)
packages/ui           tasarım sistemi bileşenleri
packages/device-sim   sanal cihaz (ESP32 simülatörü)
data/                 tohum veriler (Kc, bitki paketleri)
docs/                 PLAN.md, ADR'ler, görev tanımları
```

`agro-core` paketi önemli: matematik ve bilim, arayüzden bağımsız, birim testli. Jüriye "kod + test + doğrulama" gösterilir.

---

## 6. Matematiksel ve geometrik temel (v1'den farklar işaretli)

**6.1 Sulama (FAO-56 su bütçesi, evreye göre Kc)** — formüller v1'deki gibi: ETc = Kc·ET₀; TAW = 1000(θFC−θWP)Zr; RAW = p·TAW; Dr,i = Dr,i−1 − (P−RO) − I − CR + ETc + DP; Ks. **Yeni:** Kc evreden gelir (Kc ini→mid→end doğrusal geçiş); `p` ürüne ve evreye göre (çiftçinin eski "Ry" ayarı bu değere bağlanır); toprak su parametreleri toprak tipinden (ve SoilGrids'ten) gelir.
**6.2 Fenoloji:** GDD = Σ max(0,(Tmax+Tmin)/2 − Tbase); soğuklama (ağaçlar için saat/portion).
**6.3 Don riski:** P(don) = ensemble üyelerinden Tmin ≤ Tkritik(evre) oranı; yükselti düzeltmesi 6,5 °C/km. Kritik eşikler **onaylı bitki paketinden** gelir. (Zeytinde çiçeklenmede −3/−4 °C altı ciddi hasar, tomurcuk LT50 yaklaşık −8 °C; ancak laboratuvar değerleridir, tarla için uzman doğrulaması gerekir.)
**6.4 Ürün uygunluk skoru:** yamuk üyelik fonksiyonları + ağırlıklı geometrik ortalama (Liebig); ekonomik katman aralıklı (P10–P90).
**6.5 Geometri:** PostGIS alan/mesafe/kesişim; sensör enterpolasyonu IDW (cihaz fazında).
**6.6 Doğrulama paketi (jüri için):** (a) ET₀: Open-Meteo vs resmî istasyon verisi (izinli ise); (b) sulama modeli: sentetik senaryolar + literatür örnekleri ile birim testleri; (c) AI: 200+ soruluk uzman notlu test seti (doğruluk, kaynak oranı, "bilmiyorum" oranı, güvenlik ihlali oranı); (d) komut hattı: simülatörle gecikme ve güvenlik testi; (e) uygulama: kullanıcı testi (en az 10 çiftçi/hobi bahçıvan, SUS skoru).

---

## 7. Cihazlar (son faz) ve sanal simülatör

Donanım yok; bu yüzden:

- `packages/device-sim`: Node ile yazılmış **sanal ESP32**. Gerçek cihazla **aynı MQTT/TLS protokolü**, aynı komut/ack, toprak nemini su bütçesi modeline göre simüle eder.
- Böylece uçtan uca (uygulama → API → MQTT → cihaz → ack → uygulama) hattı, güvenlik testleri ve kural motoru **donanımsız** geliştirilir ve CI'da test edilir.
- Donanım geldiğinde yalnızca ESP32 yazılımı (C++/Arduino) yazılır; sunucu tarafı değişmez.
- Güvenlik kuralları v1 §7'deki gibi: cihaz başına kimlik, topic ACL, sunucuda yetki kontrolü, TTL/idempotent komut, ack, cihazda azami çalışma süresi, denetim kaydı, imzalı OTA.
- Alım listesi (ileride): ESP32, kapasitif toprak nem, SHT31/BME280, yağmur, akış (su) sayacı, röle/solenoid vana, pompa. Şimdi alınmasına gerek yok.

---

## 8. Pusula AI tasarımı (araştırmayla güçlendirilmiş)

1. **Giriş türleri ilk günden:** metin, **ses**, **fotoğraf** (çiftçiler en çok fotoğrafla teşhis sorar), ardından takip soruları.
2. **Bağlam:** Arazi, ürün, evre, bugünkü hava, kullanıcı geçmişi.
3. **Araçlar:** hava, takvim, arazi, fiyat, kütüphane, video, BKÜ yönlendirme, uzmana devir. Rakamı araçtan alır.
4. **RAG kaynak hiyerarşisi:** Uzman onaylı içerik > kurum yayını > genel kaynak. Çelişkide üstteki kazanır; kaynak kartı gösterilir.
5. **Güvenlik:** İlaç/doz için BKÜ ve etikete yönlendirir, kendi doz üretmez; yasaklı aktif madde listesiyle otomatik kontrol; "kesin teşhis" demez, olasılık + doğrulama yolu verir.
6. **Hibrit insan denetimi:** Riskli/düşük güvenli cevaplar uzman kuyruğuna düşer; uzman cevabı önbelleğe girer.
7. **Kalite:** Test seti, red-team senaryoları (yanlış doz, yasaklı ürün, panik sorusu), her sürümde otomatik çalıştırma.
8. **Düşük bant genişliği:** Görsel sıkıştırma, sesli cevaplar kısa; çevrimdışı "sık sorulanlar".
9. **Neden?:** Her öneride formül/kaynak açılır (Wageningen'in açıklanabilirlik yaklaşımı).

---

## 9. Tasarım yönü

- **Kimlik:** Pusula + çiftçi karakteri korunur. Slaytlardaki koyu yeşil/turkuaz zemin ve altın-turuncu vurguyu modernize eden palet: derin orman yeşili, buğday altını, toprak kahvesi, açık krem arka plan, uyarı için kırmızı/kehribar. Açık ve koyu tema.
- **Ana ekran** (eski "hava + Duyurular/Bildirimler" fikri gelişir): üstte parsel seçici + hava özeti, ortada **"Bugün yap"** kartları (takvim + risk), altta Pusula AI düğmesi (ses/fotoğraf). Gezinme 4 sekme: **Bugün · Arazilerim · Pusula AI · Pazar** (+ Kütüphane menüden).
- **Kart dili:** her bilgi görsel + tek cümle + "Ayrıntı". Kutu kutu adım adım anlatım ve video.
- **Kullanılabilirlik:** büyük dokunma alanları, yüksek kontrast, sesle okuma, sade Türkçe.
- **Süreç:** Tasarım sistemi (G0) → ana ekran + arazi akışı için yüksek doğruluklu prototip → gerçek çiftçilerle erken test.
- Not: Tasarımı kodlamadan önce ayrıca prototip olarak hazırlayıp sana gösteririm (onayından sonra uygulatırız).

---

## 10. Faz ve takvim (19 Ekim 2026'dan itibaren, ~16 hafta)

Varsayım: Teknofest 2027 başvurusu Ocak–Şubat 2027, ön değerlendirme formu Mart 2027. Takvim açıklanınca ayarlarız. Hedef: **Şubat 2027 başında çalışan, test edilmiş, demo edilebilir sürüm** (iOS/Android/web).

| Hafta | Görev                                                                                                                               | Kabul ölçütü                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1–2   | **G0** Monorepo, CI, Docker, tasarım sistemi, `CLAUDE.md`, `agro-core` iskeleti · **G1** Şema, auth (OTP), RBAC, RLS, denetim       | Boş uygulama 3 platformda açılır; yetkisiz erişim testleri geçer |
| 3–4   | **G2** Arazi/parsel/harita/Bitki Bilgi Paketi altyapısı + Kc tohum yükleme · **G3** Hava (Open-Meteo), ET₀, don olasılığı, bildirim | Alan doğru; Kc paketi yüklü; don uyarısı simülasyonla çalışır    |
| 5–6   | **G4** Takvim + duyuru motoru + hedefleme · **G5** Kurum paneli (giriş, onay)                                                       | Hedefli duyuru doğru çiftçiye düşer                              |
| 7–8   | **G6** Kütüphane + RAG (PDF→parça→vektör) · **G7** Pusula AI (metin/ses/foto, araçlar, kartlar)                                     | Kaynaklı cevap; test seti ilk skor                               |
| 9–10  | **G8** Cihaz simülatörü + MQTT + komut/ack + güvenlik · **G9** Su bütçesi motoru + kural motoru                                     | Uzaktan başlat/durdur (sanal); yetkisiz deneme reddedilir        |
| 11–12 | **G10** Fiyat toplayıcılar + pazar ekranı · **G11** Ürün uygunluk + destek eşleştirme + defter                                      | Fiyat kaynak/tarih etiketli; skor açıklanabilir                  |
| 13–14 | **G12** İçerik toplama hattı (kaynak→etiket→onay) · **G13** NDVI, veri cüzdanı, çevrimdışı iyileştirme                              | Onaylı içerik takvime düşer; NDVI grafiği                        |
| 15–16 | **G14** Güvenlik sertleştirme, performans, kullanıcı testi, mağaza paketleri, **doğrulama raporu**, proje detay raporu taslağı      | Test paketi yeşil; AI skoru raporlanmış                          |

**Her görev:** (1) iş tanımı + kabul ölçütleri + test listesi dosyası (`docs/tasks/Gx.md`), (2) Claude Code uygular, (3) CI yeşil olmadan kapanmaz, (4) ben gözden geçirip eksikleri yeni göreve yazarım. Bir görev bittiğinde çalışan, demo edilebilir bir şey olur.

**Paralel (benim yapacağım) işler:** (a) Bitki Bilgi Paketi taslakları, (b) AI test seti taslağı, (c) rakip uygulamaların ekran analizi, (d) hukuki/veri izin başvuru taslakları (MGM KEP dilekçesi, kurum veri paylaşımı), (e) proje detay raporu güncellemesi.

---

## 11. Riskler (v2)

| Risk                                  | Önlem                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tarım Cebimde benzerliği              | Farkımız (§2); karşılaştırma tablosu raporda                                                                 |
| Onaysız bilimsel değer → yanlış uyarı | Onay durumu zorunlu; onaysız değer karar üretmez                                                             |
| AI halüsinasyonu                      | RAG + araç + kaynak zorunluluğu + test/red-team + insan kuyruğu                                              |
| MGM verisi izinsiz kullanım           | Çekmeyiz; izin başvurusu; Open-Meteo                                                                         |
| Open-Meteo ticari kullanım            | Yarışmada uygun; ürünleşmede ticari lisans veya self-host                                                    |
| Tüm ürün kapsamı = veri yükü          | Ürün-bağımsız şema, tohum veri, onay iş akışı; kapsam derinliği ürün bazında "seviye 1–3" olarak etiketlenir |
| Takvim belirsizliği                   | Haftalık plan; takvim netleşince güncelle                                                                    |
| Tek kişilik ekip yükü                 | Görev bazlı otomasyon, test zorunluluğu, kapsam dondurma noktası (Ocak sonu)                                 |

**Ürün kapsam seviyeleri (tüm ürünler için gerçekçi yaklaşım):**

- Seviye 1 (tüm ürünler): ad, grup, Kc (FAO), genel iklim isteği, hava/don/sulama temel önerileri, kütüphane arama.
- Seviye 2 (öne çıkan ürünler): evre bazlı takvim, GDD, zararlı/hastalık kartları.
- Seviye 3 (derin): Fıstık ve zeytin gibi uzman içeriği zengin ürünler (elimizdeki rapor ve duyuru verisi).

---

## 12. Kararlar ve istenenler

1. **GitHub:** Bu oturumda erişilebilir bir depo göremedim. Lütfen GitHub'da **boş, özel (private) bir depo** oluştur (öneri adı: `tarim-pusula`) ve Claude'a erişim ver; sonra planı ve görev dosyalarını yüklerim.
2. **Tasarım:** Ana ekran prototipini hazırlayıp göstereyim mi? (Önerim: evet, G0'dan önce.)
3. **Bilgi yardımı:** Ziraat mühendisi/İbrahim hoca bitki paketlerini ve AI test setini onaylayabilir mi?
4. **Veri izinleri:** MGM'ye veri izni için resmî başvuru taslağını hazırlayayım mı?
5. **Teknofest takvimi:** 2027 çağrısı çıkınca haber ver (ya da bulduğunda sorayım).

---

## Kaynaklar

- Tarım Cebimde: [Hürriyet](https://www.hurriyet.com.tr/ekonomi/tarim-cebimdeye-yeni-moduller-geldi-42248830), [Tarımsal Sulama modülü](https://www.benguturk.com/ekonomi/tarim-cebimde-uygulamasina-tarimsal-sulama-modulu-eklendi-148337h)
- Teknofest: [Tarım Teknolojileri Yarışması](https://teknofest.org/tr/yarismalar/tarim-teknolojileri-yarismasi/), [2026 başvuruları](https://www.alomaliye.com/2026/01/10/teknofest-2026-sanliurfada-teknoloji-yarismalari-basvurulari-basladi/)
- MGM site kullanım şartları: [mgm.gov.tr/site/yasal-uyari.aspx](https://mgm.gov.tr/site/yasal-uyari.aspx)
- BKÜ veri tabanı: [bku.tarimorman.gov.tr](https://bku.tarimorman.gov.tr)
- FAO-56 Tablo 12: [fao.org](https://www.fao.org/3/x0490e/x0490e0b.htm)
- Open-Meteo: [dokümantasyon](https://open-meteo.com/en/docs)
- Copernicus Statistical API: [dokümantasyon](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical/Examples.html)
- İBB Hal Fiyatları: [veri seti](https://data.ibb.gov.tr/en/dataset/hal-urunleri-ve-fiyatlari-web-servisi)
- TEPGE Antep fıstığı piyasa raporu (Temmuz 2024): [PDF](https://arastirma.tarimorman.gov.tr/tepge/Belgeler/PDF%20Tarım%20Ürünleri%20Piyasaları/2024-Temmuz%20Tarım%20Ürünleri%20Raporu/AntepfıstığıTarım%20Ürünleri%20Piyasaları%20Raporu%20Temmuz-2024-v4.pdf)
- Yapay zekâ danışmanlığı: [FarmerChat testleri (Rural 21)](https://www.rural21.com/english/news/detail/article/testing-ai-advisory-services-insights-from-farmerchat-in-india-and-kenya.html), [Dünya Bankası](https://blogs.worldbank.org/en/agfood/can-ai-give-small-scale-producers-the-right-advice-)
- Wageningen: [Karar destek sistemleri](https://www.wur.nl/en/research/plant/decision-support-systems-and-user-applications), [AgROS](https://wur.nl/en/show/6.-agros-farmer-data-space.htm), [FarmMaps](https://www.hortidaily.com/article/6024685/dutch-agriculture-data-platform-launched/)
- Zeytin don toleransı derlemesi: [PMC9144808](https://pmc.ncbi.nlm.nih.gov/articles/PMC9144808/)

---

## Ek (20 Ekim 2026): kararlar

- **Sıra:** önce 2–3 ay yazılım + prototip; ziraat mühendisi görüşmeleri, MGM/kurum izin dilekçeleri yayına (go-live) yakın yapılır.
- **Sadelik ilkesi:** çiftçi için büyük "tasarım sistemi" sayfası yok; ekran başına tek ana iş (bkz. docs/UX_KURALLARI.md). Onaylı ekranlar: docs/prototype/.
- **Konum özelliği (yaşlı dostu), 4 yol:** Tarladayım (GPS) · Köyümü seçeyim (il>ilçe>köy) · Haritada göstereyim (uydu + "Burası mı?") · Yakınım yapsın (6 haneli kod, çiftçi onaylar). GPS reddedilirse köy listesine düşer. Sınır çizimi isteğe bağlı, nokta yeterli.
- **Gece çalıştırma:** G0–G14 görevleri docs/tasks/ altında; scripts/overnight.ps1 sırayla işletir, limit dolunca 2,5 saatte bir yeniden dener.
