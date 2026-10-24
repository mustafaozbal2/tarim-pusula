# Tarım Pusula — Telefonda deneme rehberi (APK)

Bu rehber, uygulamayı Android telefonuna kurup bilgisayarındaki demo sunucusuna bağlamak içindir.
**Claude senin Expo hesabına giriş yapamaz.** Aşağıda "SEN YAP" etiketli adımları yalnız sen yapabilirsin.

Özet akış: (1) Expo hesabı aç → (2) `eas-cli` kur ve giriş yap → (3) APK'yı derle → (4) APK'yı telefona kur → (5) bilgisayarda demo sunucuyu yerel ağda aç → (6) telefondan bağlan.

Gerekenler: Windows bilgisayar (Node 24 ve pnpm kurulu, repo klasörü `D:\TarimPusula`), Android telefon, ikisi için aynı Wi-Fi.

---

## 1. Ücretsiz Expo hesabı  (SEN YAP)

1. Tarayıcıda https://expo.dev/signup adresini aç.
2. E-posta, kullanıcı adı ve parola ile hesap aç. E-postana gelen doğrulama bağlantısına tıkla.
3. Kullanıcı adını ve parolanı not et. Ücretsiz plan yeterlidir (ayda sınırlı sayıda ücretsiz derleme hakkı vardır; kuyruk bazen 10–30 dakika sürebilir).

## 2. eas-cli kur ve giriş yap  (SEN YAP)

PowerShell aç:

```powershell
npm i -g eas-cli
eas login
```

`eas login` kullanıcı adını ve parolanı sorar. Doğrulamak için `eas whoami` yaz; kullanıcı adın görünmelidir.

İlk kez derlemeden önce proje Expo hesabına bağlanmalıdır (bir defa):

```powershell
cd D:\TarimPusula\apps\mobile
eas init
```

Soruları `Y` (evet) ile onayla. Bu komut `app.json` içine `extra.eas.projectId` ekler; değişikliği commit'leyebilirsin.

## 3. Sunucu adresini hazırla, sonra APK'yı derle  (SEN YAP)

APK, bilgisayardaki sunucuya **yerel ağ adresiyle** bağlanır (`localhost` telefonda çalışmaz).

1. Bilgisayarda önce adresi öğren: `pnpm run demo -- --lan` komutunu çalıştır (bölüm 5). Ekrana şuna benzer bir satır yazar:
   `APK / telefon tarayıcısı için sunucu adresi : http://192.168.1.42:8210`
2. `apps/mobile/eas.json` dosyasını aç; `preview` profilindeki `EXPO_PUBLIC_API_URL` değerini bu adresle değiştir. (Bu adımı atlarsan da olur: APK açılınca "Sunucuya bağlanılamadı" kartı çıkar, adresi **uygulamanın içine yazarsın**; yeniden derleme gerekmez. Bkz. bölüm 6.)
3. Derle:

```powershell
cd D:\TarimPusula\apps\mobile
eas build -p android --profile preview
```

   - "Generate a new Android Keystore?" sorusuna `Y` de.
   - Derleme Expo sunucularında yapılır ve 10–30 dakika sürebilir. Bitince terminalde bir **indirme bağlantısı** ve QR kod çıkar. Aynısını https://expo.dev → Projects → tarim-pusula → Builds sayfasında da bulursun.

## 4. APK'yı telefona indir ve kur  (SEN YAP)

1. Telefonda tarayıcıyı aç, bölüm 3'ün sonunda çıkan bağlantıyı aç (ya da QR kodu okut). `.apk` dosyası iner.
2. İndirilen dosyaya dokun. Android "Bu kaynaktan uygulama yüklemeye izin verilmiyor" diyebilir:
   - **Ayarlar** düğmesine dokun → tarayıcın (ör. Chrome) için **"Bu kaynaktan izin ver"** (bazı telefonlarda "Bilinmeyen kaynaklardan yükle") anahtarını aç → geri dön → **Yükle**.
3. Play Protect "Uygulamayı yine de yükle" diyebilir: **Yine de yükle**.
4. Uygulama listesinde **Tarım Pusula** simgesi (koyu yeşil zemin, pusula) görünür.

## 5. Bilgisayarda sunucuyu yerel ağda aç, telefonu bağla  (SEN YAP)

Bilgisayar ve telefon **aynı Wi-Fi'da** olmalı (misafir ağı ya da "istemci yalıtımı" açık modemlerde çalışmaz).

```powershell
cd D:\TarimPusula
pnpm run demo -- --lan
```

İlk seferde mobil web ve panel derlenir (birkaç dakika). Hazır olunca ekran şunu yazar:

```
Bilgisayarın adresi (Wi-Fi): 192.168.1.42
APK / telefon tarayıcısı için sunucu adresi : http://192.168.1.42:8210
```

**Windows güvenlik duvarı:** Telefon bağlanamıyorsa güvenlik duvarı engelliyordur. **Yönetici** olarak açtığın PowerShell'de ekranda yazan komutu bir kez çalıştır:

```powershell
netsh advfirewall firewall add rule name="Tarim Pusula Demo" dir=in action=allow protocol=TCP localport=8200,8201,8210 profile=private
```

Ağın "Özel" olması gerekir: Ayarlar → Ağ ve internet → Wi-Fi → ağın özellikleri → **Özel ağ**. İşin bitince kuralı sil:

```powershell
netsh advfirewall firewall delete rule name="Tarim Pusula Demo"
```

Telefonda önce tarayıcıdan `http://192.168.1.42:8210/health` aç. `ok` görüyorsan ağ ve güvenlik duvarı tamamdır.

Uygulamayı aç → telefon numarası (demo: ekrandaki numara) → **Kod gönder** → kod: **123456**.

> Güvenlik notu: `--lan` modu demo sunucusunu aynı ağdaki herkese açar ve demo kodu sabittir (123456). Yalnız güvendiğin ev/ofis ağında, deneme süresince aç; işin bitince Ctrl+C ile kapat. Gerçek veri girme.

## 6. Sık hatalar ve çözümleri

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Uygulama açılınca **"Sunucuya bağlanılamadı"** kartı | Adres boş/yanlış, sunucu kapalı ya da farklı Wi-Fi | Bilgisayarda `pnpm run demo -- --lan` çalışıyor mu? Telefon aynı Wi-Fi'da mı? Karttaki kutuya `http://BİLGİSAYAR_IP:8210` yaz → **Adresi kaydet** → **Yeniden dene**. (Ayarlar ekranında da aynı kutu var.) |
| Telefon tarayıcısında `…:8210/health` açılmıyor | Güvenlik duvarı ya da ağ "Genel" | Bölüm 5'teki `netsh` komutu (yönetici PowerShell) + ağı "Özel" yap |
| IP adresi her gün değişiyor | Modem adresi dinamik dağıtıyor | Demo'yu her açışta ekrandaki adresi uygulamaya yeniden yaz; ya da modemde bilgisayara sabit IP (DHCP rezervasyonu) ver |
| `eas build` "Not logged in" | Giriş yapılmadı | `eas login` (bölüm 2) |
| `eas build` "project not configured" | `eas init` yapılmadı | `cd apps\mobile` → `eas init` |
| Derleme kuyrukta uzun bekliyor | Ücretsiz plan kuyruğu | Bekle; ya da yeniden dene. Kota dolduysa bir sonraki aya kadar bekle |
| APK kurulmuyor: "Uygulama yüklenemedi" | Eski sürüm farklı imzayla kurulu | Eski Tarım Pusula'yı kaldır, yeniden kur |
| "Bilinmeyen kaynak" izni çıkmıyor | Dosyayı açan uygulama izinli değil | Dosyayı hangi uygulamadan (Chrome / Dosyalarım) açtıysan o uygulamaya izin ver |
| Harita boş / grileşiyor | Uydu karoları internet ister | Telefonun internete çıkabildiğinden emin ol (Wi-Fi'ın dışa çıkışı) |
| `http://` adres çalışmıyor | Eski derleme cleartext'i engelliyor | Bu proje `plugins/with-cleartext.js` ile http'ye izin verir; APK'yı **bu sürümden** derlediğinden emin ol |

## 7. Telefonda tarayıcıdan (PWA) — "Ana ekrana ekle"

APK kurmadan da deneyebilirsin. Sunucu `--lan` modundayken telefonda tarayıcıdan `http://192.168.1.42:8200` aç.

- **Android / Chrome:** sağ üst ⋮ menüsü → **Ana ekrana ekle** (ya da **Uygulamayı yükle**) → **Ekle**. Ana ekranda "Tarım Pusula" simgesi belirir, tam ekran açılır.
- **iPhone / Safari:** alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle** → **Ekle**.

PWA'yı üretmek için (sunucu dışında bir yere koymak istersen): `pnpm --filter @tarim/mobile run export:web` → çıktı `apps/mobile/dist`. Not: tarayıcılar `http://` (https olmayan) adreslerde servis çalışanını (çevrimdışı mod) çalıştırmaz; çevrimdışı deneme için `localhost` ya da https gerekir.

## 8. iOS hakkında

iOS'ta **şimdilik yalnız PWA** (bölüm 7) desteklenir. iPhone'a gerçek uygulama (IPA) kurmak için **Apple Developer hesabı** (yıllık ücretli) gerekir; TestFlight ya da Expo dahili dağıtımı da bu hesapla çalışır. Hesap alındığında `eas build -p ios --profile preview` ve `eas credentials` adımları bu rehbere eklenecektir.

## 9. Uygulama içinde "Hakkında"

Ayarlar → **Hakkında**: uygulama sürümü ve bağlı sunucu adresi görünür. Hata bildirirken bu iki bilgiyi yaz.

## Claude'un yapamadıkları (bu yüzden sana bırakıldı)

- Expo hesabı açmak, `eas login` yapmak, `eas init` ve `eas build` çalıştırmak (hesap gerektirir).
- Windows güvenlik duvarı kuralını eklemek (yönetici yetkisi, sistem ayarı).
- APK'yı telefona kurmak.

Kod tarafında doğrulananlar (testle): `eas.json` profilleri, paket adı `com.tarimpusula.app`, simge/açılış ekranı dosyaları, http için Android izni, sunucu adresi yokken çökmeme, `--lan` yardımcıları. **Gerçek derleme ve telefonda çalıştırma bu ortamda denenmedi.**
