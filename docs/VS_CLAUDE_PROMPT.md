Sen Tarım Pusula projesinde çalışıyorsun. Kimse cevap vermeyecek, soru sorma; makul karar ver, docs/KARARLAR.md'ye yaz. Gizli anahtarları (EXPO_TOKEN vb.) ekrana yazma, dosyaya koyma, commit'leme.

AŞAMA 0 — Hazırlık
1. `git fetch origin`; kaydedilmemiş değişiklik varsa `git stash`; `git checkout -B dev origin/dev`; `git pull origin dev`. images/ içindeki gerçek görseller GitHub'da, üzerine yazma.
2. CLAUDE.md, docs/APK_REHBERI.md, docs/ANASAYFA_SPEC.md ve docs/tasks/G22.md oku. `main` dalına dokunma.

AŞAMA 1 — Güncellenebilir APK (önce bunu yap, derleme bulutta sürerken Aşama 2'ye geç)
1. `pnpm install`. `cd apps/mobile` içinde `npx expo install expo-updates`. apps/mobile/app.json içinde `updates.url`, `runtimeVersion.policy=appVersion` ve eas.json'da kanallar zaten ayarlı; kontrol et, eksikse tamamla. `pnpm run verify` yeşil olmalı. Commit + `git push origin dev`.
2. `npx eas-cli whoami` ile giriş kontrol et. Giriş yoksa (EXPO_TOKEN ortam değişkeni de yoksa) DUR ve kullanıcıya "eas login gerekli" de; token uydurma.
3. `cd apps/mobile` içinde `npx eas-cli build -p android --profile preview --non-interactive --no-wait` ile derlemeyi başlat. Derleme linkini ve ID'yi not et. Bitince `npx eas-cli build:list --platform android --limit 1 --json` ile durumu ve APK indirme linkini al (derleme sırada beklerse beklemeden Aşama 2'ye geç, arada durumu tekrar kontrol et). Link hazır olunca kullanıcıya BÜYÜK ve net yaz: "APK hazır: <link>. Telefonda bu linki aç, indir, kur (eski uygulamanın üstüne kurulur)". APK'yı telefona SEN kuramazsın; bu adımı kullanıcı yapar.

AŞAMA 2 — G22
docs/tasks/G22.md'deki 9 maddenin HEPSİNİ sırayla tam uygula (kod + test). `pnpm run images`, `pnpm run verify` yeşil, `pnpm run demo --rebuild --no-open` ile demoyu aç, Playwright ile ana sayfa ve tüm ikon sayfalarının ekran görüntüsünü al, docs/referans/anasayfa_hedef.png ile karşılaştırıp farkları düzelt. Küçük commitler, `git push origin dev`.

AŞAMA 3 — Telefona otomatik güncelleme
G22 bitince, Aşama 1'deki derleme tamamlandıysa: kök dizinden `powershell -ExecutionPolicy Bypass -File scripts\guncelle.ps1 "G22: yeni ana sayfa"` çalıştır (EAS Update). Hata verirse nedenini yaz. Başarılıysa kullanıcıya "Telefonda uygulamayı kapatıp 2 kez aç; yeni sürüm gelir" de.

Sonunda .overnight/NOTES.md'ye devir notu yaz; en son 10 satırı geçmeyen özet ver: APK linki/durumu, G22'de neyi bitirdin, neyi doğrulayamadın.
Değişmez kurallar CLAUDE.md'dedir. Örnek içerik yalnız DEMO modunda yüklenir.
