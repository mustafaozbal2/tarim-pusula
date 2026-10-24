# DEMO — Bilgisayarda tek komutla gezilebilir demo

Amaç: Mustafa, G0–G15 çıktısını bilgisayarında tarayıcıdan gezebilsin ve beğenmediği yerleri not edebilsin. Kod yazma görevi değil, çalıştırma kolaylığı görevidir.

## Yapılacaklar
- Kökte `pnpm run demo`: tek komutla (1) Docker altyapısı gerekmeden çalışır (süreç içi veri tabanı yeterli), (2) API + mobil web paketi + kurum paneli birlikte kalkar, (3) tarayıcıda otomatik açılır: mobil http://localhost:8200, panel http://localhost:8201.
- Gerçek ağ olmadan da çalışsın: hava için örnek veri sağlayıcı, SMS için sahte sağlayıcı. Giriş ekranında SMS kodu ekranın altında "Demo kodu: 123456" olarak görünsün (yalnız demo modunda).
- Demo verisi: 2 örnek tarla (Burç Köyü Antep fıstığı, Yayla zeytin), güncel tarihli don uyarısı, örnek duyuru, örnek pazar fiyatı, Pusula AI için hazır cevaplar, sanal sulama cihazı (Sulama ekranı çalışsın). Her örnek veri "Örnek veri" rozeti taşır.
- Panel demo hesabı: kurum yöneticisi; TOTP demo modunda sabit kod ekranda yazar.
- `docs/DEMO_REHBERI.md`: Türkçe, adım adım (Docker gerekmez; `pnpm install` + `pnpm run demo`), her ekranda neye bakılacağı kontrol listesi, bilinen eksikler listesi (G15 notlarındaki "yarım" maddelerden).
- Mobil web tarayıcıda telefon boyutunda görünsün (dar sütun ortalı).

## Kabul ölçütleri
- Temiz klonda `pnpm install && pnpm run demo` ile iki adres açılır (test: sağlık ucu 200 döner)
- Demo kodu yalnız `DEMO_MODE=1` iken görünür, üretimde asla (test)
- `pnpm run verify` hatasız geçer
