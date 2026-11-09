# Tarım Pusula — NUVIA ile entegrasyon rehberi (Claude için; yalnızca OKU)

> Bu dosyayı Nuvia penceresi yazdı. **Mevcut dosyalarınıza dokunmadı.** Okuyup kendi işinize uygulayın, soru varsa `NUVIA_ISTEKLERI.md` dosyasına yazın.
> Yığın: Node API (Render) + Neon + web + Android. Sözleşmenin tamamı: `NUVIA_API.md` (aynı klasörde). Nuvia'nın kodu örnek almak için okunabilir (`D:\jarvis`), ama ORADA HİÇBİR ŞEYİ DEĞİŞTİRME.

## 0. Bu proje için özel uyarı

Bu proje CANLIDA çalışıyor (Render). Nuvia entegrasyonunu önce yerelde/dev dalında deneyin; Mustafa onaylamadan canlıya (main/Render) göndermeyin. İlaç dozu, gübre miktarı, hasat tarihi gibi sayıları yapay zekâ uydurmasın; yalnızca verilen veriyi kullansın. SMS: kendi .env'inizdeki SMSGATE_* ayarlarıyla zaten çalışıyor; Nuvia'nın SMS'i de AYNI telefonu kullanıyor (iki sistem birbirinin gönderim kotasını paylaşır: günlük toplam sınırı aşmayın).

## 1. Nuvia size ne veriyor, ne vermiyor (7 Kasım 2026)

| Konu                                                                          | Durum                                                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Metin cevabı / sohbet / JSON çıktı (`POST /v1/proje/sor`)                     | **HAZIR, canlı**                                                                                                |
| Kullanım/bütçe durumu (`GET /v1/proje/durum`)                                 | **HAZIR**                                                                                                       |
| Görsel üretme/düzenleme, sesten yazıya çevirme, dosya (PDF/Word) okuma        | **YOK — isterseniz eklenir** (`NUVIA_ISTEKLERI.md`'ye yazın)                                                    |
| SMS doğrulama                                                                 | Nuvia'dan **verilmiyor**. Kendi SMS çözümünüzü kullanın (aşağıda §5) ya da "Nuvia SMS ucu istiyoruz" diye yazın |
| Google ile giriş                                                              | Nuvia'nın kimliği SİZİN uygulamanızda ÇALIŞMAZ; kendi OAuth kimliğiniz gerekir (§6, Mustafa yapacak)            |
| Google Play'e yayın                                                           | Nuvia ile ilgisiz; ayrı geliştirici hesabı gerekir (§7)                                                         |
| Nuvia'nın hafızası, araçları (uygulama açma, TV, mesaj…), kullanıcı hesapları | **Dışarı AÇILMAZ.** Proje yalnızca kendi klasöründe tanımlı İŞLEVLERİ çağırır                                   |

Şu an Tarım Pusula için tanımlı tek işlev `deneme` (tek cümle selam). Gerçek işlevlerinizi Nuvia penceresi, sizin `NUVIA_ISTEKLERI.md` dosyanıza göre yazacak.

## 2. `.env` ve gizli değerler (değerleri ASLA koda/git'e yazmayın)

`.env` (yerel) dosyanıza ŞU SATIRLARI ekleyin (Mustafa/Nuvia penceresi değeri verir; admin panelinden alınır: Nuvia `/admin` → "Dış projeler" → "Anahtarı göster"):

```
NUVIA_ADRES=https://nuvia.jarvis-bulut.workers.dev
NUVIA_PROJE_ANAHTARI=            # "tarim_pusula.nvp_..." biçiminde; boşsa sahte mod
NUVIA_SAHTE=1                    # 1: ağa çıkmadan sahte cevap; anahtar gelince 0 yapın
```

- Cloudflare Worker projelerinde: yerelde `.dev.vars` dosyasına aynı satırlar; canlıda `npx wrangler secret put NUVIA_PROJE_ANAHTARI`. (`NUVIA_ADRES` ve `NUVIA_SAHTE` `wrangler.toml [vars]` içinde durabilir, anahtar durmaz.)
- Render/Node projelerinde: Render panelindeki Environment bölümüne ekleyin.
- Anahtar YALNIZCA sunucuda kullanılır. Telefon uygulamasına, web sayfasına, `site/` dosyalarına, loglara GÖMÜLMEZ.
- Bu projede hiçbir Gemini/Groq/Claude/OpenAI anahtarı olmayacak.

## 3. Çağrı örneği (TypeScript; tek dosyada `nuvia_istemci.ts` yapın)

```ts
export interface NuviaCevap {
  ok: boolean;
  metin?: string;
  veri?: unknown;
  saglayici?: string;
  hata?: string;
}

export async function nuviaSor(
  env: { NUVIA_ADRES: string; NUVIA_PROJE_ANAHTARI?: string; NUVIA_SAHTE?: string },
  islev: string,
  girdi: string,
  mesajlar?: { rol: 'kullanici' | 'model'; metin: string }[],
): Promise<NuviaCevap> {
  if (env.NUVIA_SAHTE === '1' || !env.NUVIA_PROJE_ANAHTARI)
    return { ok: true, metin: '[sahte cevap] ' + girdi.slice(0, 60), saglayici: 'sahte' };
  for (let deneme = 0; deneme < 2; deneme++) {
    // en çok 1 yeniden deneme
    try {
      const r = await fetch(env.NUVIA_ADRES + '/v1/proje/sor', {
        method: 'POST',
        signal: AbortSignal.timeout(45_000),
        headers: { 'content-type': 'application/json', 'x-nuvia-proje': env.NUVIA_PROJE_ANAHTARI },
        body: JSON.stringify(mesajlar ? { islev, mesajlar } : { islev, girdi }),
      });
      const v: any = await r.json().catch(() => ({}));
      if (r.ok) return v;
      if (r.status === 429 || r.status === 502) {
        if (deneme === 0) await new Promise((s) => setTimeout(s, 1500));
        continue;
      }
      return { ok: false, hata: v.hata || String(r.status) };
    } catch {
      /* ağ hatası: bir kez daha dene */
    }
  }
  return { ok: false, hata: 'nuvia_ulasilamadi' };
}
```

Kurallar: kullanıcıya teknik hata metni göstermeyin ("Şu an öneri üretemedim, biraz sonra tekrar deneyin" gibi kendi Türkçe cümlenizi kurun); aynı girdiye aynı cevabı tekrar ödememek için sonucu kendi D1/DB'nizde önbellekleyin; her kullanıcı için dakikada sınır koyun (Nuvia dakikada 20 istek / proje, aylık bütçe sınırlıdır).
`.json` işlevlerinde `v.veri` gelir (zaten ayrıştırılmış). Yanıtı arayüze koymadan önce şemasını doğrulayın.

## 4. Nuvia'nın SİZE ilettiği hatalar

`401 anahtar_yok` · `403 proje_yok` · `400 islev_yok` (tanımsız işlev) · `400 girdi_yok` · `429 butce_doldu`/`cok_hizli` · `502 beyin_yok` (30 sn sonra dene).

## 5. SMS (kısa)

Nuvia'nın kayıt SMS'i "SMS Gateway for Android" uygulamasıyla Tarım Pusula'daki bir Android telefondan gidiyor (`SMSGATE_USER`/`SMSGATE_PASSWORD`/`SMSGATE_URL`). Bu bilgiler gizlidir, başka projeye kopyalanmaz.
Bu projenin SMS'e ihtiyacı varsa SEÇENEKLER: (a) e-posta + şifre ile kayıt (SMS'siz, ücretsiz — Nuvia'nın 30 sürümündeki gibi), (b) Nuvia'dan "ortak SMS ucu" isteyin (`NUVIA_ISTEKLERI.md`'ye yazın; günlük toplam sınır var, kötüye kullanıma açık olduğu için telefon numarası başına/gün sınırı koyarız).

## 6. Google ile giriş (Mustafa yapacak; siz yalnızca kodu hazırlayın)

Nuvia'nın Google kimliği (Web istemci kimliği) Nuvia'nın paket adına ve imzasına bağlıdır; sizin uygulamanızda KULLANILAMAZ. Gerekenler:

1. Google Cloud Console → OAuth consent screen (uygulama adı, gizlilik URL'si) → Credentials → "Web client" (sunucu için) + "Android client" (paket adı + imza SHA-1) oluşturun.
2. Sunucu `idToken`'ı `https://oauth2.googleapis.com/tokeninfo?id_token=` ile ya da Google'ın açık anahtarlarıyla doğrular; `aud` sizin kimliğinizle eşleşmeli.
3. Yayın durumu "Test"ten "Üretim"e alınmadan 100 test kullanıcısı sınırı vardır. Nuvia'daki örnek: `D:\jarvis\android\app\src\main\java\com\mustafa\jarvis\kullanici\GoogleGiris.kt` ve `D:\jarvis\bulut\src\hesap.ts`.
   Kimlik değerlerini Mustafa verecek; siz yalnızca `GOOGLE_ISTEMCI_KIMLIKLERI` adlı bir gizli değişken bekleyen kodu yazın.

## 7. Google Play (kısa; Nuvia ile ilgisiz)

Geliştirici hesabı (tek seferlik ücret, kimlik doğrulama) → uygulama imzası (Play App Signing; yükleme anahtarını kaybetmeyin) → AAB üretimi → gizlilik politikası URL'si (sitenizdeki `/gizlilik`) → "Veri güvenliği" formu → içerik derecelendirme → test kanalı → yayın. Kişisel veri (konum, yüz, telefon) topluyorsanız formda doğru beyan edin. Bunları Mustafa yapar; sizden istenen: sitede gizlilik/şartlar sayfaları ve uygulamada hesap silme yolu.

## 8. Bitirince

`NUVIA_ISTEKLERI.md` dosyasını doldurun (aynı klasörde hazır şablon var) ve Mustafa'ya "Nuvia'dan isteklerimiz hazır" deyin.
