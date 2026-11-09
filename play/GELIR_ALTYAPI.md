# Gelir altyapısı notları (karar: Mustafa)

Bu turda kod yazılmadı; Tarım Pusula'da güven önceliklidir.

**Öneri:** Reklam yok. Tarım Pusula'nın kullanıcısı çiftçi; hava, don ve resmî duyuru gibi güven isteyen içerikte reklam güveni zedeler ve "veri paylaşımı" beyanlarını büyütür. Gelir istenirse abonelik.

**Abonelik (isteniyorsa):** Dijital içerik için Google Play Faturalandırma zorunlu. Önerilen tasarım:

1. Play Console'da abonelik ürünü (ör. `pusula_pro_aylik`).
2. Uygulama: `react-native-iap` ya da `expo-iap` (yerel modül: yeni APK/AAB gerekir, OTA ile gelmez).
3. Sunucu: satın alma belirteci Google Play Developer API ile doğrulanır; `entitlements(user_id, urun, bitis)` tablosu; yetki sunucuda kontrol edilir (istemciye güvenilmez).
4. Ücretsiz kalacaklar: hava, don uyarısı, haberler, hesap silme. Ücretli aday: yapay zekâ sohbet kotası, çoklu arazi sınırı üstü, ayrıntılı raporlar.
5. Geri ödeme/iptal bildirimleri (RTDN) ve ayrıntılı politika metni.

**Reklam (yine de istenirse):** AdMob + `play-services-ads`, UMP onay formu (KVKK/GDPR), `AD_ID` izni, Play'de reklam kimliği beyanı, sitede `app-ads.txt`, yalnız ana sayfa altında sade banner, uyarı/don kartlarında asla reklam yok. Bu durumda Veri güvenliği formu ve gizlilik politikası güncellenir.

**Hava verisi lisansı:** Open-Meteo ücretsiz plan ticari olmayan kullanımdır; gelir gelirse ücretli plana ya da başka sağlayıcıya geçilmeli.
**Sunucu maliyeti:** Render ücretsiz plan uyur (UptimeRobot ile uyandırılıyor); Nuvia yapay zekâ ve SMS kotası gelire karşı izlenmeli.
