# G8 — Komut gecikmesi raporu

Bu rapor `pnpm --filter @tarim/device-sim bench` ile üretilir (tohum 20261020, belirlenimli).

**Ne ölçülür:** sunucunun komutu yayınlamasından cihazın ack'inin sunucuya ulaşmasına kadar gidiş-dönüş süresi
(sunucu > aracı > cihaz > ack > sunucu). Komut imzası doğrulama, TTL ve yinelenme denetimleri dahildir.

**Dürüstlük notu:** ağ gecikmesi MODELDİR, ölçüm değildir. Tek yön gecikme log-normal: ortanca 150 ms,
sigma 0.6; ayrıca her teslimde %2 olasılıkla +3000 ms sıçrama
(zayıf sinyal / yeniden iletim). Gerçek ESP32 + GSM/Wi-Fi ölçümü donanım gelince aynı biçimle yapılmalıdır.
Sunucu tarafında gerçek (süreç içi) gidiş-dönüş ayrıca her komutta `irrigation_commands.latency_ms` alanına yazılır;
yönetici `GET /admin/irrigation/latency` ile p50/p95 görür.

| Ölçüt                        | Değer   |
| ---------------------------- | ------- |
| Örnek (komut) sayısı         | 2000    |
| Ortalama                     | 477 ms  |
| Ortanca (p50)                | 333 ms  |
| p95                          | 913 ms  |
| p99                          | 3456 ms |
| En büyük                     | 6558 ms |
| TTL (60 sn) içinde onaylanan | %100.00 |

**Yorum:** Ortanca gidiş-dönüş yaklaşık 0.3 sn. Onay (ack) TTL içinde gelmezse arayüz
"cihaza ulaşılamadı" der ve komut zaman aşımına uğrar; cihaz geç gelen komutu kendi saatiyle reddeder.
