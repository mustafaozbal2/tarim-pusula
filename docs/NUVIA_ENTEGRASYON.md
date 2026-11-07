# Nuvia entegrasyonu — Tarım Pusula tarafı (8 Kasım 2026)

Kaynak sözleşme: kökteki `NUVIA_API.md` ve `NUVIA_ENTEGRASYON.md` (Nuvia penceresi yazdı, DEĞİŞTİRİLMEZ). İstek listesi: `NUVIA_ISTEKLERI.md`.

## Mimari
Telefon/web → **Tarım Pusula API** (Render) → Nuvia `POST /v1/proje/sor`. Telefon Nuvia'yı çağırmaz; anahtar yalnız sunucu ortamındadır.
Nuvia kapalı, anahtarsız ya da hatalıysa sistem bozulmaz: her yerde güvenli yedek vardır.

## Ayrılan yerler (kodda hazır)
| Nuvia işlevi | Kullanan | Dosya | Nuvia yoksa |
|---|---|---|---|
| `haber_analiz` | Resmî kaynak taraması (günde 5×) | `apps/api/src/tarama/analiz.ts` (`NuviaAnalizci`) | `KuralAnalizci` (anahtar kelime) |
| `soru_cevapla` | Uzman 12 saat cevap vermezse geçici cevap | `apps/api/src/nuvia/client.ts` (`HttpNuviaClient`), `bekleme.ts` | Soru uzmanda bekler |
| `niyet` (isteğe bağlı) | Robot sohbeti | `apps/mobile/src/asistan/beyin.ts` | Yerel eşleyici (yeterli) |

Ortak çağrı katmanı: `apps/api/src/nuvia/gateway.ts` (`ayarOku`, `nuviaCagir`): başlık `x-nuvia-proje`, gövde `{islev, girdi}` (girdi JSON metni), 429/502'de 1 yeniden deneme, 45 sn zaman aşımı, yanıtta `veri` okunur.

## Ortam değişkenleri (yalnız .env / Render; repoda yok)
```
NUVIA_ADRES=https://nuvia.jarvis-bulut.workers.dev
NUVIA_PROJE_ANAHTARI=tarim_pusula.nvp_...    # Nuvia /admin -> Dış projeler -> Anahtarı göster
NUVIA_SAHTE=1                                # 1: ağa çıkma (yedekler çalışır); anahtar gelince sil
NUVIA_BEKLEME_SAAT=12                        # uzman bu kadar saatte cevaplamazsa Nuvia'ya gider
NUVIA_BEKLEME_TARAMA_DK=30
HABER_TARAMA=1                               # resmî kaynak taramasını aç
```
`NUVIA_URL` eski ad olarak da okunur. Anahtar yoksa ya da `NUVIA_SAHTE=1` ise Nuvia istemcileri kapalıdır.

## Güvenlik kuralları (kod zorlar)
- Cevapta ilaç dozu/karışım oranı varsa ATILIR (`containsDose`, kural 2); şema dışı cevap atılır.
- Soru cevabının sonuna her zaman yapay zekâ uyarısı eklenir ("...Tüm risk size aittir..."); uzman cevabı gelince o esastır.
- Haber: yalnız girdideki ürün kimlikleri kabul edilir; otomatik haber `taslak-uzman-onayi-bekliyor`, bildirim üretmez (kural 1).
- Anahtar ve soru içeriği loglanmaz.

## Nuvia'yı bağlama adımları
1. Nuvia tarafında `tarim_pusula/index.ts`'e `haber_analiz` ve `soru_cevapla` işlevlerini `NUVIA_ISTEKLERI.md`'ye göre ekleyin (`json: true`) ve dağıtın.
2. Render ortamına `NUVIA_PROJE_ANAHTARI` ve `NUVIA_ADRES` ekleyin, `NUVIA_SAHTE` değişkenini silin (API yeniden başlar). Mustafa onayı olmadan canlıya anahtar konmaz.
3. Deneme: `GET {NUVIA_ADRES}/v1/proje/durum` (başlıkla) işlevleri listelemeli. Tarama: yönetici ucu `POST /admin/jobs/haber-tara`. Uzman beklemesi: yerelde `NUVIA_BEKLEME_SAAT=0`.
4. Fotoğraflı soru için Nuvia görsel kabul edince `client.ts`'te `gorsel` notu yerine gerçek görsel gönderilir (tek yer).

## Testler
`apps/api/src/nuvia/nuvia.test.ts` (geçit başlığı, `veri`, doz atma, ağ/HTTP hatası, bekleme servisi) ve `apps/api/src/tarama/tarama.test.ts` (Nuvia geçerli / bozuk / ağ yok: kurala düşme). Testler Nuvia'ya gerçek istek atmaz.
