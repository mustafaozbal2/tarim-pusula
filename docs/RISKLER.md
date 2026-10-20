# Riskler ve lisans notları

## Open-Meteo (hava verisi) — lisans ve ticari kullanım (G3, 2026-10-20)

- **Veri lisansı:** Open-Meteo verileri CC BY 4.0'dır. Atıf zorunludur; uygulama her hava/don kartında "Kaynak: Open-Meteo" ve çekilme saatini gösterir (API yanıtında `source` + `fetchedAt`).
- **Ücretsiz uç (`api.open-meteo.com`, `ensemble-api.open-meteo.com`) yalnız ticari olmayan kullanım içindir** ve çağrı sınırı vardır (yayın tarihindeki kamuya açık sınır: günde yaklaşık 10 000 çağrı; saatlik ve dakikalık sınırlar da var). Teknofest jüri gösterimi ve pilot çalışma bu kapsamda kabul edildi; **gerçek kullanıcılara ticari yayında ücretli plan (API anahtarı) şarttır.** Anahtar `.env` içinde `OPEN_METEO_API_KEY`; varsa istemci otomatik olarak `customer-` uçlarını kullanır.
- **Çağrı bütçesi:** İstemci ~5 km'lik ızgara hücresi başına 30 dk önbellek tutar; yakın tarlalar aynı çağrıyı paylaşır. Tarla başına istek = 2 (tahmin + topluluk). Büyüme durumunda ücretli plan ya da kendi sunucumuzda Open-Meteo'yu barındırmak (açık kaynak) değerlendirilecek.
- **Bilinen sınır:** Model çıktısı tarlaya özel ölçüm değildir; ızgara hücresinden ve DEM yüksekliğinden gelir. Uygulama bunu "tahmin" diye adlandırır. Kendi sensör verimiz (sonraki görevler) geldikçe yerel düzeltme eklenecek.
- **Hizmet kesintisi:** Tahmin alınamazsa önbellekteki eski veri `stale: true` ile döner ve ekranda uyarılır; önbellek de yoksa API 503 verir, uygulama son kaydedilen bilgiyi gösterir.

## Expo Push

- Expo'nun push servisi üçüncü taraf bir aracıdır (APNs/FCM önünde). Mesaj gövdesinde kişisel veri yok: tarla adı ve genel uyarı. Telefon numarası, TC no vb. hiçbir zaman gönderilmez. Üretimde `EXPO_ACCESS_TOKEN` ile gelişmiş güvenlik açılmalı.
