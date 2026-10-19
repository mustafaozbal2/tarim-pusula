# Kararlar

## 2026-10-20 · G0
- **pnpm `node-linker=hoisted`**: Expo/Metro, pnpm'in simge bağlantılı yapısıyla sorun çıkarır; hoisted en az sürtünmeli seçenek. Metro `watchFolders` ve `nodeModulesPaths` monorepo kökünü içerir.
- **TypeScript 5.9 (kök)**: npm'deki 7.x sürümü Expo SDK 58'in beklediği ~6.0 aralığının dışında ve ESLint eklentileriyle uyumu doğrulanmadı. `expo install --fix` ile `react`/`react-dom` 19.3.0'a sabitlendi (Expo beklentisi).
- **`verify` = `turbo run lint typecheck test` + `prettier --check .`**: biçim denetimi de kabul ölçütüne dahil.
- **Paket kaynak olarak tüketilir**: workspace paketleri `src/index.ts`'i doğrudan gösterir (derleme adımı yok); Metro ve Vitest doğrudan TS okur.
- **PostGIS + pgvector**: tek resmî imaj yok; `postgis/postgis:16-3.4` üzerine `postgresql-16-pgvector` kuran `infra/db/Dockerfile` yazıldı. Eklentiler `infra/db-init/01-extensions.sql` ile açılır. (Docker bu oturumda derlenip çalıştırılmadı.)
- **Mosquitto anonim erişim yalnız geliştirmede**; üretimde TLS + kullanıcı/ACL zorunlu (sulama görevinde kurulacak).
- **UI testi**: bileşen stilleri saf fonksiyonlarda (`styles.ts`) tutuldu; dokunma alanı >= 56, yazı >= 16/18 ve WCAG AA (4.5:1) karşıtlığı Vitest ile korunuyor. Bileşenler ince birer sarmalayıcı.
- **Sekme etiketi 13 px**: onaylı prototipte böyle; 16 px kuralının tek istisnası, 60 px dokunma alanı ve ikon+yazıyla telafi edildi.
- **Boş ekranlarda örnek veri**: prototipteki örnek içerik "Örnek veri" etiketiyle gösteriliyor; hiçbiri öneri/komut üretmiyor (kural 1).
- **i18n**: i18next + react-i18next; tek dil `tr`, yeni dil `resources`'a eklenerek gelir. Ekranlar şimdilik tipli `tr` nesnesini doğrudan kullanıyor.
- **agro-core iskeleti**: FAO-56 evreli Kc eğrisi (Denklem 66 / Şekil 34), ETc = Kc·ET0 ve "uzman onayı olmadan öneri yok" kapısı (`canDriveAdvice`) eklendi.
- **device-sim iskeleti**: cihazda azami vana süresi 30 dk sabiti ve kısıtlama fonksiyonu (kural 3).
- **Prototipte olup G0'da yapılmayanlar**: Pusula/Cevap/Sulama/Konum/Köy/Harita/Yakın/Ürün ekranları sonraki görevlerin işi; G0 yalnız 4 sekme.
