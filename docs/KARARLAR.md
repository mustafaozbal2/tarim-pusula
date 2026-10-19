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

## 2026-10-20 · G1
- **Drizzle/Prisma yerine düz SQL migration** (`apps/api/src/db/migrations`): RLS, tetikleyici, SECURITY DEFINER işlevleri ve sütun bazlı yetkiler ORM şemasında ifade edilemiyor; güvenlik mantığı SQL'de olmalı. Basit `migrate()` çalıştırıcısı `schema_migrations` tablosunu tutar.
- **Test veritabanı PGlite** (süreç içi gerçek Postgres/WASM): Docker olmadan RLS ve tetikleyiciler gerçek motorda test edilir. Üretim `pg` havuzuyla (`PgDb`); aynı SQL. PostGIS gerekmeyen G1 tablolarında `lat/lon` düz sütun (PostGIS G2'de parsel geometrisiyle gelir). `PgDb` bu oturumda gerçek sunucuya karşı denenmedi.
- **Yetki iki katmanlı**: (1) tüm veri sorguları `SET LOCAL ROLE tp_app` altında çalışır; `tp_app` RLS'yi atlayamaz, yalnız gereken sütunlara yetkilidir (ör. `owner_id` güncellenemez). (2) API, RLS'nin reddini (42501 ya da 0 satır) **403**'e çevirir. Olmayan kayıt da 403 döner (varlık sızdırılmaz); reddedilen her deneme `access.denied` olarak denetlenir.
- **Admin tarlaları göremez** (veri minimizasyonu); yalnız kullanıcı/rol/denetim kaydını yönetir. `institution_admin`, `expert`, `advisor` vb. tarlaya ancak sahibinin `field_access` (read/write) vermesiyle erişir.
- **Denetim kaydı**: tek yazma yolu `write_audit()` (SECURITY DEFINER); tablolardaki AFTER tetikleyicileri her ekle/güncelle/sil için satır üretir (kişisel veri kopyalanmaz, yalnız anahtar). UPDATE/DELETE/TRUNCATE tetikleyiciyle tablo sahibi için bile engelli; satırlar SHA-256 ile zincirli, `verify_audit_chain()` bozulmayı bulur. Zincir yazımı advisory lock ile sıralıdır (yazma verimi sınırı kabul edildi). Sulama komutları (G8) aynı `write_audit()`'i çağıracak.
- **Hesap silme**: kullanıcı satırı silinince tarla/cihaz/rıza/oturum CASCADE gider. Denetim satırları değiştirilemez olduğundan **kalır** ama yalnız anonim UUID taşır (telefon/ad yok) — KVKK'da güvenlik kaydı saklama yükümlülüğüyle gerekçelendi; hukuki danışman doğrulaması gerekir. Rıza kayıtları yalnız eklenir (geri çekme yeni satır).
- **OTP**: 6 hane, HMAC-SHA256 ile saklanır (`OTP_SECRET`), 5 dk geçerli, kod başına 5 deneme, numara başına 10 dk'da 5 istek (429), tek kullanımlık. Oturum jetonu 32 bayt rastgele, veritabanında yalnız SHA-256 özeti, 30 gün. Sahte SMS sağlayıcısı varsayılan; gerçek sağlayıcı anahtarı yoksa sahteye düşer.
- **Admin başlangıcı**: `ADMIN_PHONES` (.env) listesindeki numaralar girişte `admin` rolü alır; ayrıca rol atama `/admin/users/:id/roles` ile yalnız admin yapar (RLS de zorlar).
- **Rol modeli**: yeni kullanıcı `farmer`; kullanıcı kendine rol veremez. Diğer roller admin atar. Rol-özel ekranlar sonraki görevlerde.
- **Nest DI**: Vitest/esbuild `emitDecoratorMetadata` üretmediği için tüm bağımlılıklar `@Inject()` ile açıkça tanımlı.
