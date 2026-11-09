# Uygulama erişimi ve inceleme hesabı (Play Console > Uygulama içeriği > Uygulama erişimi)

Tarım Pusula'ya giriş telefon numarası ve SMS koduyla yapılır. Play inceleyicisi gerçek SMS alamayacağı için SMS'siz sabit kodlu bir inceleme hesabı kullanılır.

**Nasıl çalışır**

- Sunucuda `PLAY_INCELEME_TELEFON=+90XXXXXXXXXX` ortam değişkeni verilir (yalnız demo modunda, yalnız bu numara için). Değişken yoksa özellik kapalıdır (şimdiki durum).
- Bu numara için doğrulama kodu sabit **123456**'dır; diğer tüm numaralara gerçek SMS gider.
- Hesap boştur: gerçek kullanıcı verisi yoktur. İnceleyici arazi ekleyip denemeler yapabilir.
- İnceleme bitince Render'da değişken silinir; hesap Menü > Veri cüzdanı > Hesabı sil ile silinir.

**Play Console'a yazılacak metin**

> Giriş: uygulamayı aç, "Çiftçi" olarak telefon numarası alanına +90XXXXXXXXXX yaz, "Kod gönder"e bas, kod alanına 123456 yaz. Giriş sonrası tüm özellikler kullanılabilir. Arazi eklemek için Menü > Yeni arazi ekle > "Haritada göstereyim" yolunu izleyin (konum izni gerekmez). Hesap silme: Menü > Veri cüzdanı > Hesabı sil.

**Yayın öncesi yapılacaklar (sahibi):** numarayı seç, Render'da değişkeni ekle, giriş akışını bir kez dene.
