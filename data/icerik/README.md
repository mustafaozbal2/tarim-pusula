# data/icerik — içerik içe aktarma klasörü

Buraya konan Word (`.docx`), PDF ve düz metin (`.txt`, `.md`) dosyaları `POST /admin/jobs/content-ingest`
(yönetici + MFA) ile TASLAK olarak kütüphaneye ya da bitki paketine yüklenir. Klasörü `CONTENT_INGEST_DIR` değiştirir.

Her dosyanın yanında `<dosya>.kunye.json` olmalıdır; künyesiz dosya yüklenmez:

```json
{
  "title": "Belge başlığı",
  "publisher": "Yayımlayan kurum",
  "sourceDate": "2025-02-10",
  "sourceVersion": "v1",
  "sourceUrl": "https://... (isteğe bağlı)",
  "licenseNote": "Kullanım izni / lisans",
  "tier": "kurum",
  "kind": "kutuphane"
}
```

`kind: "bitki-paketi"` için `cropId` (ör. `zeytin`) gerekir ve Word belgesinde "Alan | Değer" tablosu bulunmalıdır
(Kc başlangıç, Kc orta, Kc son; isteğe bağlı Kc son (en yüksek), En yüksek boy (m)).
Onay durumu künyede verilemez: her şey `taslak-uzman-onayi-bekliyor` girer, onay yalnız uzman ucundan.
