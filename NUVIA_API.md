# NUVIA API sözleşmesi (dış projeler için) — sürüm 1 (CANLI kodda yazıldı: 7 Kasım 2026)

> Tek kaynak: `D:\jarvis\docs\NUVIA_API.md`. Projelerdeki kopyalar buradan alınır; değişiklik yalnızca Nuvia tarafında yapılır.
> Kod: `D:\jarvis\bulut\src\projeler\` (her projenin kendi klasörü: `ayna/`, `z/`, `tercih_asistani/`; ortak motor `cekirdek.ts`).

## Mantık

Ayna, Z ve Tercih Asistanı yapay zekâyı **kendi anahtarlarıyla değil, Nuvia üzerinden** kullanır. Gemini/Groq/Claude anahtarları, kota dönüşü,
ücretsiz-önce yönlendirme ve bütçe Nuvia bulutunda kalır. Projelerin kodunda HİÇBİR yapay zekâ anahtarı bulunmaz.
**Her proje yalnızca Nuvia tarafında tanımlı İŞLEVLERİ çağırabilir** (ör. "tercih önerisi üret"). Nuvia'nın sohbet, araç, hafıza, belge gibi
yetenekleri dışarı açılmaz. Yeni işlev eklemek Nuvia penceresinin işidir: projeden "Nuvia'dan istek" olarak GOREV.md'ye yazın.

## Adres ve kimlik

- Adres: `https://nuvia.jarvis-bulut.workers.dev` (yedek: `https://jarvis-ozbal.jarvis-bulut.workers.dev`).
- Başlık: `X-Nuvia-Proje: <proje>.<anahtar>` — örn. `ayna.nvp_xxxxxxxx…`. Proje adları: `ayna`, `z`, `tercih_asistani`.
- Anahtarı **Mustafa** Nuvia admin panelinden alır (`/admin` → giriş → "Dış projeler" ya da `POST /v1/admin/proje_anahtar/<proje>`) ve projenin `.env` dosyasına
  `NUVIA_PROJE_ANAHTARI=ayna.nvp_...` olarak koyar (git'e girmez).
- Anahtar **yalnızca sunucuda** (projenin kendi arka ucunda) kullanılır; telefon uygulamasına/tarayıcıya gömülmez. Akış: telefon/web → projenin kendi sunucusu → Nuvia.

## Uç noktalar

### `POST /v1/proje/sor`

```json
{ "islev": "deneme", "girdi": "kullanıcının yazdığı metin" }
```

ya da konuşma geçmişiyle: `{ "islev": "...", "mesajlar": [{ "rol": "kullanici|model", "metin": "..." }] }` (son 12 ileti).
Cevap: `{ "ok": true, "metin": "...", "saglayici": "groq:...", "maliyet_usd": 0 }` — işlev JSON döndürecek şekilde tanımlıysa `"veri": {...}` gelir.

### `GET /v1/proje/durum`

`{ "ok": true, "proje": "ayna", "bu_ay_usd": 0.01, "sinir_usd": 1.5, "istek_bu_ay": 42, "islevler": { "deneme": "…" } }`

## Hatalar

`{ "hata": "kod", "mesaj": "Türkçe açıklama" }`

- `401 anahtar_yok` (başlık yok/yanlış) · `403 proje_yok` · `400 islev_yok` / `girdi_yok` · `429 butce_doldu` / `cok_hizli` · `502 beyin_yok` (tüm sağlayıcılar düştü; 30 sn sonra yeniden dene)
- İstemci 45 sn zaman aşımı koyar, en çok 1 kez yeniden dener. Kullanıcıya teknik hata metni göstermez; kendi Türkçe cümlesini kurar.

## Sınırlar

- Proje başına aylık tahmini Claude bütçesi (varsayılan 1,5 $; ücretsiz sağlayıcılar sayılmaz) ve dakikada 20 istek. Admin panelinde proje bazında görünür.
- Sağlayıcı sırası: ücretsizler önce (Groq, Gemini, …), Claude en sonda. `kalite: "iyi"` işlevlerde Claude önce.
- Gizlilik: Nuvia proje isteklerinin içeriğini SAKLAMAZ; yalnızca sayı/maliyet tutar. Yüz fotoğrafı gibi hassas veri gönderilmez (Ayna: yüz verisi telefondan çıkmaz).
- Model sayı/tarih/kaynak uydurmasın diye her işlevin yönergesine "yalnızca verilen veriyi kullan" kuralı konur.

## Hazır olana kadar

`deneme` işlevi her projede vardır (tek cümle selam). Nuvia henüz yayında değilse (ya da `NUVIA_SAHTE=1` ise) proje istemcisi ağa çıkmadan
`{ "ok": true, "metin": "[sahte cevap] ...", "saglayici": "sahte" }` döndürür. Yayından sonra yalnızca `NUVIA_SAHTE=0` yapılır.
