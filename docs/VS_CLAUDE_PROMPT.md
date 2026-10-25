Sen Tarım Pusula projesinde çalışıyorsun. Kimse cevap vermeyecek, soru sorma; makul karar ver, docs/KARARLAR.md'ye yaz.

Başlamadan önce (sırayla):
1. `git fetch origin` ve `git checkout -B dev origin/dev` (yerelde kaydedilmemiş değişiklik varsa önce `git stash`). `git pull origin dev` ile en son durumu al. images/ klasöründeki gerçek görseller (amblem, çiftçi, ikonlar, kartlar) GitHub'da; üzerine yazma.
2. CLAUDE.md, docs/ANASAYFA_SPEC.md ve docs/tasks/G22.md dosyalarını oku. G22.md'deki 9 maddenin HEPSİNİ sırayla, tam uygula (kod + test). Kabul ölçütleri sağlanmadan bitirme. `main` dalına dokunma.
3. `pnpm install`, sonra `pnpm run images`, `pnpm run verify` (yeşil olmalı), `pnpm run demo --rebuild --no-open` ile demoyu aç; Playwright ile ana sayfa ve tüm ikon sayfalarının ekran görüntüsünü al, docs/referans/anasayfa_hedef.png ile karşılaştır, farkları düzelt.
4. Küçük ve anlamlı commitler at, sonunda `git push origin dev`. .overnight/NOTES.md'ye G22 devir notu yaz (ne yapıldı, ne yarım).
5. En sonda 8 satırı geçmeyen özet yaz: neyi bitirdin, neyi doğrulayamadın.
Değişmez kurallar CLAUDE.md'dedir (onaysız veri uyarı üretmez, ilaç dozu uydurma yok, sulama güvenliği, anahtarlar yalnız .env). Örnek içerik yalnız DEMO modunda yüklenir.
