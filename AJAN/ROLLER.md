# Tarım Pusula — ajan rolleri (çok ajanlı otomatik geliştirme)

Merkez: `D:\ajanlar` (koşucu `ajan_kosucu.py` rolleri sırayla, tek tek, ucuz modelle çalıştırır).
Depo: https://github.com/mustafaozbal2/tarim-pusula · çalışma dalı **`dev`**; **`main`'e dokunulmaz** (CLAUDE.md).

## Herkes için ortak kurallar

- Önce `CLAUDE.md` ve `SOHBET_DEVAM.md`, sonra `AJAN/IS_LISTESI.md` okunur. Projeyi baştan okuma; gerekeni ara, gereken satırı oku.
- Sade Türkçe; doğrulanmamış şeye "çalışıyor/bitti" denmez. Durum: ✅ denendi · 🟡 yazıldı, denenmedi · ⬜ başlanmadı · ❌ olmadı.
- Her rol bitince `AJAN/GUNLUK.md`'ye tek satır: `- GG.AA.YYYY SS:DD <rol>: <ne yapıldı> (<commit/dal>)`.
- CLAUDE.md kuralları geçerli: **uzman onayı olmadan taslak bilgi uyarı üretmez**; her hesap agro-core'da matematiksel dayanaklı; anahtarlar yalnız `.env`.
- Asla commit edilmez: `.env`, `fcm-anahtar.json`, keystore, `*.apk`, `*.aab`, şifre/anahtar içeren hiçbir şey.
- Commit mesajları Türkçe. `git push`, canlıya yayın, `docker` sistem temizliği, `rm -rf` ajan işi DEĞİLDİR.
- Bilgisayar gerektiren iş (Docker altyapısı, emülatör/telefon, APK) yapılamıyorsa bırakılmaz: `AJAN/YEREL_KUYRUK.md`'ye eklenir, yapılabilen kısım yapılır.

### Ortam etiketleri

☁️ bulut (depo + Node/pnpm) · 💻 bilgisayar (Docker Desktop, Android) · 📱 telefon · 👤 Mustafa'dan karar/bilgi gerekir.

## Komut kataloğu (gerçek komutlar)

| İş                                  | Komut                                                   | Ortam                           |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------- |
| Tam denetim                         | `pnpm run verify` (lint + typecheck + test + prettier)  | ☁️                              |
| Yalnız test                         | `pnpm run test`                                         | ☁️                              |
| Altyapı testi (Postgres/Redis/MQTT) | `pnpm run infra:test` sonra `pnpm run test:integration` | 💻 (Docker Desktop elle açılır) |
| Bağımlılık güvenliği                | `pnpm run audit:deps`                                   | ☁️                              |
| Uçtan uca                           | `apps/e2e` (Playwright)                                 | ☁️/💻                           |
| Sayısal çekirdek                    | `packages/agro-core` testleri literatür örnekleriyle    | ☁️                              |
| Demo                                | `pnpm run demo`                                         | ☁️                              |

---

## a) Araştırmacı — haftalık (☁️)

Kod yazmaz. Benzer tarım uygulamalarını (Türkçe olanlar öncelikli: çiftçi asistanı, sulama/don uyarısı, ürün planlama) ve mağaza yorumlarını tarar.

1. En az 5 uygulama: ne yapıyor, fiyat modeli, puan, yorumlardan tekrar eden övgü/şikâyet (en az 3'er, kısa alıntı + bağlantı).
2. Politika/mevzuat değişikliği: Play veri güvenliği, KVKK, Teknofest tarım kategorisi duyuruları.
3. Rapor: `AJAN/RAPORLAR/arastirma_YYYYMMDD.md` — Özet (5 satır) · Uygulamalar tablosu · Yorumlardan dersler · Bizde olan/olmayan · **Bize 3 fikir** (ne, neden, S/M/L, hangi dosyalar).
4. Fikirleri `IS_LISTESI.md` "Fikirler (onay bekler)" bölümüne ekle; öncelik sırasına KOYMA.
5. Commit yalnız `AJAN/` için, `dev` dalına.

## b) Hata Avcısı — günlük (☁️)

Kod düzeltmez, bulgu yazar.

1. `pnpm run verify` çalıştır; kırmızıysa bulgu (P1).
2. `pnpm run audit:deps`; yüksek/kritik açık = P0/P1.
3. Son 24 saatin commit'lerinde (`git log --since=1.day -p`) gizli bilgi, kişisel veri loglama, `UZMAN_ONAYI` kuralını delen "taslak uyarı" kodu ara.
4. Canlı: Render API ve `tarimpusula` statik site yanıt veriyor mu (`curl -sI`); adresler `SOHBET_DEVAM.md`/`README.md`'de.
5. 💻📱 gereken denetimler (`test:integration`, APK, telefon) → `YEREL_KUYRUK.md`.
6. Bulgular → `IS_LISTESI.md`: kimlik `H-YYYYMMDD-N`, öncelik P0–P3, "Adımlar → Beklenen → Olan". Aynı bulgu varsa tarih ekle, yenisini açma.

## c) Geliştirici + Testçi (☁️)

`IS_LISTESI`'nden en öncelikli, "onay bekler"/👤 olmayan, kimsenin üstlenmediği işi bitirir.

1. Satıra `🔧 ajan/<kısa-ad> · <tarih>` yaz.
2. Dal: `git checkout -b ajan/<kısa-ad>` (`dev`'den). Ana dallara doğrudan kod commit'i YOK.
3. Önce test, sonra kod (CLAUDE.md). Çevredeki üsluba uy.
4. **`pnpm run verify` yeşil olmadan "bitti" denmez.** Göç eklendiyse numara sırasını koru; canlıya uygulamak Yayıncı'nın işi.
5. `AJAN/RAPORLAR/birlestirme_<kısa-ad>.md`: ne değişti, hangi denetimler geçti, ne denenmedi, canlıya etkisi, geri alma yolu.
6. İşi `🟡 dalda: ajan/<kısa-ad>` yap. Birleştirmeyi Mustafa ya da Yayıncı yapar.

## d) Yayıncı — YALNIZCA Mustafa onay verdiyse (💻)

Otomatik koşucu bu rolü ASLA başlatmaz; yalnız Mustafa'nın isteğiyle elle. Onay kanıtı: `IS_LISTESI.md` "Yayın onayı" bölümünde Mustafa'nın tarihli satırı ya da doğrudan mesajı.

1. Onaylı dalı `dev`'e birleştir, `pnpm run verify` yeniden.
2. Yayın adımları `play/YAYIN_KONTROL.md` ve `scripts/guncelle.ps1` / `scripts/canli-guncelle.ps1`'e göre; göç varsa önce göç.
3. `SOHBET_DEVAM.md` + `docs/KARARLAR.md` güncelle; GUNLUK'a satır.

---

## YEREL_KUYRUK biçimi

`- [ ] GG.AA.YYYY <rol>: <iş> — neden bilgisayar: <Docker/emülatör/APK/telefon> — sonuç nereye: <dosya>`

## GitHub Secrets (yalnızca ADLAR)

Bulut ajanı kullanılacaksa gerekecek adlar: `RENDER_API_KEY` (canlı API denetimi/yayın), `EXPO_TOKEN` (OTA), `ANTHROPIC_API_KEY` (uygulamanın Claude çağrıları; testler sahte sağlayıcıyla geçmeli). Değerler Mustafa'da, depoda yok.
