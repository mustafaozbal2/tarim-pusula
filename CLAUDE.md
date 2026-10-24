# Tarım Pusula — Claude çalışma kuralları

Proje: Çiftçiler için mobil + web uygulaması ("Bilinçli Tarım, Verimli Üretim"). Teknofest Tarım Teknolojileri, lisans üstü kategori. Jüri profesördür: her hesap matematiksel olarak dayanaklı ve test edilmiş olmalı.

## Her zaman oku
- docs/PLAN.md (ana plan), docs/TASARIM_REFERANSI.md (görsel kaynak), docs/UX_KURALLARI.md, docs/tasks/Gx.md (sıradaki görev), docs/prototype/ (ESKİ kısa demo taslakları: YALNIZ akış mantığı için bak; görünüm için docs/TASARIM_REFERANSI.md geçerli)

## Çalışma düzeni
- Soru sorma. Makul karar ver, docs/KARARLAR.md'ye tarih + gerekçeyle yaz, devam et.
- Görev dosyasındaki kabul ölçütleri sağlanana kadar bitirme. Kök `pnpm run verify` (lint+typecheck+test) yeşil olmalı.
- Önce test, sonra kod; sayısal çekirdeği (packages/agro-core) literatür örnekleriyle doğrula.
- `dev` dalında çalış, küçük ve anlamlı commitler at. `main`'e dokunma.
- .overnight/NOTES.md dosyasına her görev sonunda: ne yapıldı, ne yarım, sonraki görev için not.

## Değişmez kurallar
1. Uzman onayı olmayan (taslak) bilgi: rozetle gösterilir, ASLA uyarı/öneri/komut üretmez.
2. Yapay zekâ ilaç dozu veya karışım oranı UYDURMAZ; BKÜ'ye yönlendirir. Atıfsız iddia yok.
3. Sulama komutu: sunucuda yetki kontrolü, TTL, idempotency, ack, cihazda azami süre 30 dk, audit log. Başkası başkasının vanasını açamaz.
4. TC kimlik no toplanmaz. Telefon SMS-OTP. KVKK veri minimizasyonu.
5. Gizli anahtarlar yalnız .env (repoda yok; .env.example var). Anahtar yoksa sahte sağlayıcıyla çalış ve testler yine geçsin.
6. Her veri kaynağı için kaynak + tarih + sürüm saklanır. Robots/lisans ihlal edilmez.
7. Arayüz: Türkçe, emoji yok, çiftçi dili. Görünüm kuralları ve renkler YALNIZ docs/TASARIM_REFERANSI.md'den (eski uygulama temelli, yoğun, profesyonel). Eski "büyük yazı/56 px" kuralı iptal.

## Güvenlik sınırı
- Yalnız bu depo klasörü içinde çalış. Klasör dışında dosya silme/değiştirme yok. `rm -rf`, disk biçimlendirme, sistem ayarı yok.
- Dışarıdan indirilen dosyaları çalıştırma; paketleri yalnız resmi kayıtlardan (npm/pip) kur.

## Yığın
Expo (RN)+TS+Expo Router · Next.js · NestJS · PostgreSQL+PostGIS+pgvector · Redis+BullMQ · MQTT · Claude API (araç çağırma, RAG) · pnpm+Turborepo · Vitest/Playwright.
