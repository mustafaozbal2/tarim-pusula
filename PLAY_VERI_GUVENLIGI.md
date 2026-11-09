# Google Play "Veri güvenliği" formu: Tarım Pusula

Hazırlandı: 9 Kasım 2026. Form yüklenmeden önce Play Console'da güncel soruları kontrol et. Politika adresi: `site/gizlilik.html` (yayında: site adresi + `/gizlilik.html`). Hesap silme adresi: `/hesap-sil.html`.

**Genel yanıtlar**

- Uygulama veri topluyor mu: Evet.
- Aktarım sırasında şifreleme: Evet (https).
- Kullanıcı veri silme talebinde bulunabilir mi: Evet (uygulama içinde: Menü > Veri cüzdanı > Hesabı sil; web: hesap-sil.html).
- Reklam kimliği: toplanmıyor. Reklam yok.
- Veriler satılmıyor.

| Play veri türü                                                               | Toplanıyor                                                        | Paylaşılıyor (3. taraf)                                                   | Zorunlu mu                   | Amaç                        | Silinebilir                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------- | --------------------------- | ------------------------------------- |
| Telefon numarası (Kişisel bilgiler)                                          | Evet                                                              | Evet: SMS sağlayıcı (kod göndermek için, hizmet sağlayıcı)                | Zorunlu                      | Hesap yönetimi, güvenlik    | Evet                                  |
| Yaklaşık/kesin konum (Konum)                                                 | Evet, yalnız izin verilirse ve arazi eklerken                     | Evet: hava servisi yaklaşık koordinatı alır (kimliksiz, hizmet sağlayıcı) | İsteğe bağlı                 | Uygulama işlevi (hava, don) | Evet                                  |
| Fotoğraflar (Fotoğraf ve videolar)                                           | Evet, yalnız kullanıcı gönderirse                                 | Evet: yapay zekâ hizmeti (yorum için, hizmet sağlayıcı)                   | İsteğe bağlı                 | Uygulama işlevi             | Evet (sunucudaki kayıt)               |
| Ses (Ses dosyaları)                                                          | Hayır: ses cihazda yazıya çevrilir, kayıt saklanmaz               | Hayır                                                                     | İsteğe bağlı                 | Sesle soru sormak           | Uygulanamaz                           |
| Mesajlar / kullanıcı içeriği: sorular ve yapay zekâ sohbet metni             | Evet                                                              | Evet: yapay zekâ hizmeti                                                  | İsteğe bağlı                 | Uygulama işlevi             | Evet                                  |
| Uygulama etkinliği: sulama komutu ve işlem denetim kaydı                     | Evet                                                              | Hayır                                                                     | Zorunlu (güvenlik)           | Güvenlik, hesap yönetimi    | Hesapla birlikte kimliksiz hâle gelir |
| Cihaz veya diğer kimlikler: push belirteci                                   | Evet                                                              | Evet: Expo Push ve Firebase Cloud Messaging (hizmet sağlayıcı)            | İsteğe bağlı (bildirim izni) | Bildirim                    | Evet                                  |
| Takvim                                                                       | Hayır: takvime yazma kullanıcı isteğiyle yapılır, sunucuya gitmez | Hayır                                                                     | İsteğe bağlı                 | Uygulama işlevi             | Uygulanamaz                           |
| Finansal bilgi, sağlık, kişiler, mesajlar (SMS), web geçmişi, T.C. kimlik no | Hayır                                                             | Hayır                                                                     | -                            | -                           | -                                     |

**Not:** "Hizmet sağlayıcı" aktarımı Play'de "paylaşım" sayılmaz, ama politikada açıkça yazılıdır. Yurt dışı hizmetler (yapay zekâ modeli, hava, bildirim) için politika madde 3'e bak.
**Şifreleme:** aktarımda şifreli; sunucu veritabanı sağlayıcının disk şifrelemesiyle durağan şifreli; oturum anahtarı cihazda secure-store.
