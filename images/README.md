# images/ — uygulama görselleri

Her yuva için dosya ZATEN vardır: üzerinde "Resim N" yazan gri yer tutucu. Gerçek görseli **aynı adla üzerine yazın**; kod değişmez.

Sonra çalıştırın: `pnpm run images` (görselleri `apps/mobile/assets/images/` içine kopyalar; `pnpm run demo` ve derleme öncesi kendiliğinden çalışır).

| Dosya                              | İdeal boyut (px) | Nerede görünür                                    |
| ---------------------------------- | ---------------- | ------------------------------------------------- |
| amblem.png (Resim 1)               | 256 x 256        | Ana sayfa, sol üst: amblem                        |
| ciftci.png (Resim 2)               | 400 x 560        | Ana sayfa, orta: çiftçi çizimi (saydam arka plan) |
| ikon_arazilerim.png (Resim 3)      | 128 x 128        | Ana sayfa ikonu: Arazilerim                       |
| ikon_arazi_islemleri.png (Resim 4) | 128 x 128        | Ana sayfa ikonu: Arazi İşlemleri                  |
| ikon_verim_haritasi.png (Resim 5)  | 128 x 128        | Ana sayfa ikonu: Verim Haritası                   |
| ikon_hava.png (Resim 6)            | 128 x 128        | Ana sayfa ikonu: Hava Durumu                      |
| ikon_uzman.png (Resim 7)           | 128 x 128        | Ana sayfa ikonu: Uzman Desteği                    |
| ikon_bildirim.png (Resim 8)        | 128 x 128        | Ana sayfa ikonu: Mobil Bildirim                   |
| ikon_ayarlar.png (Resim 9)         | 128 x 128        | Ana sayfa ikonu: Profil Ayarları                  |
| kart_1.jpg (Resim 10)              | 300 x 480        | Kayan şerit, 1. kart                              |
| kart_2.jpg (Resim 11)              | 300 x 480        | Kayan şerit, 2. kart                              |
| kart_3.jpg (Resim 12)              | 300 x 480        | Kayan şerit, 3. kart                              |
| kart_4.jpg (Resim 13)              | 300 x 480        | Kayan şerit, 4. kart                              |
| kart_5.jpg (Resim 14)              | 300 x 480        | Kayan şerit, 5. kart                              |
| urun_1.jpg (Resim 15)              | 240 x 240        | Pazar: 1. ürün görseli (ürün sırasına göre)       |
| urun_2.jpg (Resim 16)              | 240 x 240        | Pazar: 2. ürün görseli                            |
| urun_3.jpg (Resim 17)              | 240 x 240        | Pazar: 3. ürün görseli                            |
| urun_4.jpg (Resim 18)              | 240 x 240        | Pazar: 4. ürün görseli                            |
| urun_5.jpg (Resim 19)              | 240 x 240        | Pazar: 5. ürün görseli                            |
| urun_6.jpg (Resim 20)              | 240 x 240        | Pazar: 6. ürün görseli                            |

## Kurallar

- Yer tutucuyu üreten betik (`python scripts/gen-images.py`) var olan dosyayı ASLA ezmez.
- İkon dosyaları (`ikon_*.png`) yer tutucuyken uygulama çizgi SVG ikonunu gösterir; dosyayı değiştirince sizin görseliniz görünür.
- Yeni yuva eklemek: `images/manifest.json` + `apps/mobile/src/assets.ts` + `pnpm run images` (testler üçünün tutarlılığını denetler).
- Yalnız kullanım hakkınız olan görselleri koyun.
