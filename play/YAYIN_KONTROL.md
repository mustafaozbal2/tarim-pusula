# Play yayın kontrol listesi: Tarım Pusula

Yapıldı (depoda):

- [x] PL-1 `production` EAS profili: AAB, `EXPO_PUBLIC_PLAY=1`, https API. `plugins/with-play.js` Play sürümünde REQUEST_INSTALL_PACKAGES, SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE ve cleartext'i çıkarır; `UpdateGate` Play sürümünde site APK denetimini atlar. `expo config --type introspect` ile doğrulandı. Site APK'sı (`preview`) değişmedi.
- [x] PL-2 İzin gerekçeleri: `MAGAZA_METNI.md`; izin açıklamaları app.json'da.
- [x] PL-3 Hesap silme: uygulama içi (Veri cüzdanı) + `site/hesap-sil.html`; e2e testi.
- [x] PL-4 `site/gizlilik.html`, `PLAY_VERI_GUVENLIGI.md`.
- [x] PL-5 `TELIF.md`, uygulama içi Görsel kaynakları sayfası.
- [x] PL-6 simge, öne çıkan görsel, metinler. Ekran görüntüleri cihazdan alınacak.
- [x] PL-7 `INCELEME_ERISIMI.md`, `PLAY_INCELEME_TELEFON` (varsayılan kapalı).
- [x] PL-8 `GELIR_ALTYAPI.md`.
- [x] PL-9 (G36) Yapay zekâ ile üretilen içerik politikası: sohbette her yapay zekâ cevabının altında "Cevabı bildir" (bilgi yanlış / uygunsuz içerik / zarar verebilir); `POST /robot/bildir`, `yz_bildirimleri` tablosu, yönetim panelinde "Bildirilen Yapay Zekâ Cevapları". Resmî site haberleri Nuvia tarafından özetlenir ve her kartta "Kaynağı aç" ile özgün sayfa verilir.
- [x] PL-10 (G36) Sürüm 1.0.0; `runtimeVersion` 0.3.0 sabit (yerel kod değişmedi). Play AAB'si `eas build -p android --profile production` ile alınır; `versionCode` EAS'ta kendiliğinden artar.

Sahibinin yapacakları: Play Console hesabı/doğrulama; iletişim e-postasını `site/gizlilik.html` ve `site/hesap-sil.html` içine yaz; amblem/ikon/çiftçi çizimi sahipliğini `TELIF.md`'de teyit et; AAB için `eas build -p android --profile production` (Expo hesabı/anahtar gerekir, bu turda çalıştırılmadı); yükleme anahtarını yedekle; içerik derecelendirme anketi; ekran görüntüleri; iç test kanalı.
Açık risk: haritada altlık sağlayıcısı atfı; Open-Meteo ticari kullanım; "Sağlık/tarım tavsiyesi" şikâyetine karşı yapay zekâ uyarısı uygulamada var.
