# Harita altlığı ve parsel verisi — araştırma kaydı (G21)

Durum: sayfalar bu turda açılıp okunmadı; koşullar "doğrulanamadı" işaretli. Karar, kodda bayrakla değişir.

## Parsel verisi (TKGM)

- **TKGM izni olmadan hiçbir servis çağrısı yapılmaz.** Kodda TKGM / Parsel Sorgu / TAKBİS çağrısı yok (mobil testte kaynak taramasıyla korunur).
- Kaynak: https://parselsorgu.tkgm.gov.tr (herkese açık sorgu arayüzü; kullanım şartı ve toplu/otomatik erişim izni: doğrulanamadı). Resmî yol: TKGM'ye kurumsal başvuru (ders/yarışma için yazı). Beklerken: çiftçi tarla sınırını haritada kendisi işaretler (mevcut çizim akışı); sınır arazi kaydından gelir.

## Uydu altlığı sağlayıcıları

| Sağlayıcı | Bayrak | Anahtar | Kaynak | Kullanım şartı |
|---|---|---|---|---|
| EOX Sentinel-2 cloudless (varsayılan) | `eox` | yok | https://s2maps.eu | CC BY-NC-SA (2021 sürümü, ticari olmayan); atıf zorunlu; ticari kullanımda lisans: doğrulanamadı |
| Esri World Imagery | `esri` | anahtarsız deneme uç noktası; üretim için ArcGIS hesabı/anahtarı beklenir | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 | Atıf zorunlu; üretimde kullanım ve kota koşulları: doğrulanamadı |
| MapTiler Satellite | `maptiler` | `EXPO_PUBLIC_MAPTILER_KEY` | https://www.maptiler.com/cloud/pricing/ , https://www.maptiler.com/terms/ | Ücretsiz katman ticari olmayan kullanım; sınırlar: doğrulanamadı |
| Mapbox Satellite | `mapbox` | `EXPO_PUBLIC_MAPBOX_TOKEN` | https://www.mapbox.com/legal/tos | Aylık ücretsiz kota; sınırlar: doğrulanamadı |

Seçim: `EXPO_PUBLIC_MAP_PROVIDER=eox|esri|maptiler|mapbox` (`apps/mobile/src/location/mapProvider.ts`). Anahtar gereken sağlayıcıda anahtar yoksa EOX altlığı kalır. `EXPO_PUBLIC_TILE_URL` verilirse o kullanılır. Mapbox/MapTiler anahtarı uygulamaya gömülür (istemci anahtarı); URL kısıtlı, düşük yetkili anahtar kullanılmalı.

En net görüntü için öneri (doğrulanmadı, yan yana görsel denemesi yapılmadı): Esri/MapTiler/Mapbox çoğu bölgede EOX'tan daha yüksek zoom ve güncel görüntü verir; EOX 2021, zoom 14 sınırlı.

## G23 (2026-10-26): varsayılan altlık Esri World Imagery

Mustafa yakında bulanıklığı (EOX Sentinel-2, en çok 14. seviye) istemedi. Varsayılan Esri World Imagery (18. seviye, anahtarsız, atıf: "Esri, Maxar, Earthstar Geographics ve GIS User Community"). Harita kaynağın 1 üstünden fazla yakınlaşmaz. **Doğrulanamadı:** Esri World Imagery kullanım koşulları bu oturumda okunmadı; ticari yayından önce Esri lisansı okunmalı ya da sözleşmeli sağlayıcıya (MapTiler/Mapbox anahtarı) geçilmeli. EOX hâlâ `EXPO_PUBLIC_MAP_PROVIDER=eox` ile seçilebilir.
