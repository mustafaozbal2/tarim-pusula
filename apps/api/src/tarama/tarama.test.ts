import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { importCropCatalog } from '../crops';
import { DataService } from '../data.service';
import { migrate, PgliteDb, systemTx } from '../db/db';
import { DOZ, KuralAnalizci, NuviaAnalizci, guvenliAnaliz, kisalt, urunleriBul } from './analiz';
import { extractArticle, extractListItems, trDate } from './html';
import { importResmiKaynaklar } from './kaynak';
import { TaramaService } from './servis';

const LISTE = `<html><body>
<a href="https://gaziantep.tarimorman.gov.tr/Haber/512/Fistik-Fidani-Dagitimi-Basliyor"><img src="x.jpg"></a>
<a title="Fıstık fidanı dağıtımı başlıyor" href="https://gaziantep.tarimorman.gov.tr/Haber/512/Fistik-Fidani-Dagitimi-Basliyor">Fıstık fidanı dağıtımı başlıyor</a>
<a title="Personel tayin listesi" Yayin="03.11.2026" href="/Duyuru/422/Personel-Tayin-Listesi">Personel tayin listesi</a>
<a href="https://kotu.example.com/Haber/9/Disaridan">Dış site</a>
<a href="http://gaziantep.tarimorman.gov.tr/Haber/7/Http">http</a>
<a href="/Sayfalar/Hakkimizda.aspx">Hakkımızda</a>
</body></html>`;

const MAKALE = `<html><head><title>Fıstık fidanı dağıtımı</title></head><body>
<nav><p>Erişilebilirlik menüsü ve çerez ayarları bu satırda uzun uzun yazıyor olsun</p></nav>
<p>Şahinbey ilçesinde Antep fıstığı üreticilerine sertifikalı fidan dağıtımı için başvurular 10 Kasım'da başlayacaktır.</p>
<img src="/FotografGalerisi/2026/fidan.jpg?RenditionID=2"><img src="/images/bknLogo.png">
<p>Başvurular ilçe müdürlüğüne yapılacaktır. Ayrıntılar duyuruda yer almaktadır.</p>
<script>alert(1)</script></body></html>`;

describe('HTML ayıklama', () => {
  it('liste: yalnız aynı sunucudaki https haber/duyuru yolları, tekrarsız, en uzun başlıkla', () => {
    const it = extractListItems(LISTE, 'https://gaziantep.tarimorman.gov.tr/');
    expect(it.map((x) => x.url)).toEqual([
      'https://gaziantep.tarimorman.gov.tr/Haber/512/Fistik-Fidani-Dagitimi-Basliyor',
      'https://gaziantep.tarimorman.gov.tr/Duyuru/422/Personel-Tayin-Listesi',
    ]);
    expect(it[0]!.title).toBe('Fıstık fidanı dağıtımı başlıyor');
    expect(it[1]!.date).toBe('2026-11-03');
  });
  it('makale: menü/script metni alınmaz, görsel logo değil fotoğraf galerisinden', () => {
    const a = extractArticle(MAKALE, 'https://gaziantep.tarimorman.gov.tr/Haber/512/x');
    expect(a.text).toContain('sertifikalı fidan dağıtımı');
    expect(a.text).not.toMatch(/Erişilebilirlik|alert/);
    expect(a.image).toBe(
      'https://gaziantep.tarimorman.gov.tr/FotografGalerisi/2026/fidan.jpg?RenditionID=2',
    );
  });
  it('tarih ve kısaltma', () => {
    expect(trDate('Yayın 05.11.2026')).toBe('2026-11-05');
    expect(trDate('31.13.2026')).toBeNull();
    expect(kisalt('Bir cümle. İkinci cümle burada devam ediyor ve uzuyor.', 14)).toBe('Bir cümle.');
  });
});

describe('analiz', () => {
  const ids = ['antep-fistigi', 'zeytin', 'elma-kiraz-armut', 'elma-kiraz-armut-ortulu', 'bugday'];
  const g = {
    kaynak: { ad: 'X', tur: 'il_mudurlugu', il: 'Gaziantep', ilce: null },
    baslik: 'Fıstık fidanı dağıtımı',
    metin: 'Antep fıstığı üreticilerine fidan dağıtımı için başvuru başlıyor.',
  };
  it('kural: ürün, kategori, ilgili', async () => {
    const r = await new KuralAnalizci().analiz(g, ids);
    expect(r.urunler).toEqual(['antep-fistigi']);
    expect(r.kategori).toBe('yonlendirme');
    expect(r.ilgili).toBe(true);
  });
  it('kiraz tüm kiraz kimliklerine eşlenir; alakasız haber ilgisiz', async () => {
    expect(urunleriBul('Kiraz hasadı', ids)).toEqual([
      'elma-kiraz-armut',
      'elma-kiraz-armut-ortulu',
    ]);
    const r = await new KuralAnalizci().analiz(
      { ...g, baslik: 'Personel tayin listesi', metin: 'Kurum içi atama listesi yayımlanmıştır.' },
      ids,
    );
    expect(r.ilgili).toBe(false);
  });
  it('dozlu özet atılır, bilinmeyen ürün kimliği süzülür (kural 2)', () => {
    const r = guvenliAnaliz(
      {
        ilgili: true,
        baslik: 'Başlık',
        ozet: 'Litreye 5 ml karıştırın',
        urunler: ['antep-fistigi', 'uydurma'],
        kategori: 'onlem',
      },
      g,
      ids,
    );
    expect(r.ozet).toBe('');
    expect(r.urunler).toEqual(['antep-fistigi']);
    expect(DOZ.test('kg/da 3 kg')).toBe(true);
  });
  it('Nuvia: geçerli yanıt kabul, bozuk yanıt ve ağ hatası kurala düşer', async () => {
    const iyi = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          veri: {
            ilgili: true,
            baslik: 'Nuvia başlığı',
            ozet: 'Kısa özet',
            urunler: ['zeytin'],
            kategori: 'bilgilendirme',
          },
        }),
      )) as unknown as typeof fetch;
    const a = await new NuviaAnalizci(
      { url: 'https://n.example', projeAnahtari: 'tarim_pusula.nvp_t' },
      undefined,
      iyi,
    ).analiz(g, ids);
    expect(a.baslik).toBe('Nuvia başlığı');
    const bozuk = (async () =>
      new Response('{"ok":true,"veri":{"x":1}}')) as unknown as typeof fetch;
    const b = await new NuviaAnalizci(
      { url: 'https://n.example', projeAnahtari: 'nvp_t' },
      undefined,
      bozuk,
    ).analiz(g, ids);
    expect(b.urunler).toEqual(['antep-fistigi']);
    const yok = (async () => {
      throw new Error('ağ');
    }) as unknown as typeof fetch;
    const c = await new NuviaAnalizci(
      { url: 'https://n.example', projeAnahtari: 'nvp_t' },
      undefined,
      yok,
    ).analiz(g, ids);
    expect(c.urunler).toEqual(['antep-fistigi']);
  });
});

describe('tarama hattı (veritabanı)', () => {
  async function kur(robots: string) {
    const db = new PgliteDb();
    await migrate(db);
    await importCropCatalog(db);
    await systemTx(db, (q) =>
      q.query(
        `INSERT INTO official_sources(name, kind, province, district, url)
         VALUES ('Test İl Müdürlüğü','il_mudurlugu','Gaziantep',NULL,'https://gaziantep.tarimorman.gov.tr/')`,
      ),
    );
    const sayac = { liste: 0, makale: 0 };
    const f = (async (u: string | URL) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) return new Response(robots);
      if (url.endsWith('/')) {
        sayac.liste++;
        return new Response(LISTE);
      }
      sayac.makale++;
      if (url.includes('/Duyuru/'))
        return new Response(
          '<html><title>Personel tayin listesi</title><p>Kurum içi atama listesi yayımlanmıştır, ilgililere duyurulur.</p></html>',
        );
      return new Response(MAKALE);
    }) as unknown as typeof fetch;
    const svc = new TaramaService(
      new DataService(db as never),
      () => new Date('2026-11-07T10:00:00Z'),
      f,
      new KuralAnalizci(),
    );
    svc.pauseMs = 0;
    return { db, svc, sayac };
  }

  it('yeni haberi duyuru olarak yazar (onaysız, otomatik, özgün bağlantı); ikinci tur çift kayıt açmaz', async () => {
    const { db, svc } = await kur('User-agent: *\nDisallow: /_layouts/');
    const a = await svc.runAll();
    expect(a[0]!.durum).toBe('tamam');
    expect(a[0]!.yeni).toBe(1);
    const rows = await systemTx(db, (q) =>
      q.query<{
        title: string;
        auto: boolean;
        review_status: string;
        source_url: string;
        image_url: string;
        targeting: { places: unknown[]; cropIds: string[] };
      }>(
        `SELECT title, auto, review_status, source_url, image_url, targeting FROM announcements WHERE auto`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.review_status).toBe('taslak-uzman-onayi-bekliyor');
    expect(rows[0]!.source_url).toMatch(/^https:\/\/gaziantep\.tarimorman\.gov\.tr\/Haber\/512\//);
    expect(rows[0]!.image_url).toMatch(/FotografGalerisi/);
    expect(rows[0]!.targeting.cropIds).toEqual(['antep-fistigi']);
    expect(rows[0]!.targeting.places).toEqual([{ province: 'Gaziantep' }]);
    const b = await svc.runAll();
    expect(b[0]!.yeni).toBe(0);
    expect(
      await systemTx(db, (q) => q.query(`SELECT 1 FROM announcements WHERE auto`)),
    ).toHaveLength(1);
  }, 60_000);

  it('robots.txt tarama izni vermiyorsa hiç haber çekilmez (kural 6)', async () => {
    const { svc, sayac } = await kur('User-agent: *\nDisallow: /');
    const r = await svc.runAll();
    expect(r[0]!.durum).toMatch(/robots/);
    expect(sayac.liste + sayac.makale).toBe(0);
  }, 60_000);

  it('kaynak CSV: 81 il, hepsi https ve tarimorman.gov.tr; Bakanlık ana sitesi yok; tekrar yüklemek çift kayıt açmaz', async () => {
    const db = new PgliteDb();
    await migrate(db);
    expect(await importResmiKaynaklar(db)).toBe(81);
    expect(await importResmiKaynaklar(db)).toBe(0);
    const rows = await systemTx(db, (q) =>
      q.query<{ url: string }>(`SELECT url FROM official_sources`),
    );
    for (const r of rows) expect(r.url).toMatch(/^https:\/\/[a-z]+\.tarimorman\.gov\.tr\/$/);
    expect(rows.some((r) => r.url.startsWith('https://www.tarimorman'))).toBe(false);
  }, 60_000);
});

describe('analiz güvenliği (TP-V4 bulguları)', () => {
  it('emoji ve sıfır genişlikli karakter temizlenir; metinde geçmeyen ürün atılır; boş metinde Nuvia çağrılmaz', async () => {
    const { emojisiz, guvenliAnaliz, NuviaAnalizci } = await import('./analiz');
    expect(emojisiz('​İl Müdürlüğümüze Ziyaret 🤝')).toBe('İl Müdürlüğümüze Ziyaret');
    const a = guvenliAnaliz(
      {
        ilgili: true,
        baslik: 'Defne fidanı 🌱',
        ozet: 'Defne dağıtıldı',
        urunler: ['zeytin'],
        kategori: 'guncel',
      },
      {
        kaynak: { ad: 'x', tur: 'il_mudurlugu', il: null, ilce: null },
        baslik: 'Defne fidanı dağıtımı',
        metin: 'Defne fidanları dağıtıldı.',
      },
      ['zeytin'],
    );
    expect(a.urunler).toEqual([]);
    expect(a.baslik).toBe('Defne fidanı');
    let cagri = 0;
    const f = (async () => (cagri++, new Response('{}'))) as unknown as typeof fetch;
    const r = await new NuviaAnalizci(
      { url: 'https://n.example', projeAnahtari: 'k' },
      undefined,
      f,
    ).analiz(
      {
        kaynak: { ad: 'x', tur: 'il_mudurlugu', il: null, ilce: null },
        baslik: 'Mercimekler Şanlıurfa’dan dağılıyor',
        metin: '',
      },
      ['misir-tane'],
    );
    expect(cagri).toBe(0);
    expect(r.urunler).not.toContain('misir-tane');
  });
});

describe('yayın tarihi (TP-V4)', () => {
  it('meta / itemprop / JSON-LD / <time> okunur; düz metindeki başvuru tarihi kullanılmaz', async () => {
    const { yayinTarihi, extractArticle } = await import('./html');
    expect(
      yayinTarihi('<meta property="article:published_time" content="2026-11-03T09:00:00+03:00">'),
    ).toBe('2026-11-03');
    expect(yayinTarihi('<meta content="2026-10-20T10:00:00Z" itemprop="datePublished">')).toBe(
      '2026-10-20',
    );
    expect(
      yayinTarihi('<script type="application/ld+json">{"datePublished":"2026-09-01"}</script>'),
    ).toBe('2026-09-01');
    expect(yayinTarihi('<time datetime="2026-11-05">5 Kasım</time>')).toBe('2026-11-05');
    expect(
      yayinTarihi('<p>Başvurular 04.11.2026 – 13.11.2026</p><time datetime="bozuk">'),
    ).toBeNull();
    const m = extractArticle(
      '<html><title>T</title><meta property="article:published_time" content="2026-11-03T09:00:00Z"><p>' +
        'x'.repeat(50) +
        '</p></html>',
      'https://a.gov.tr/Haber/1/x',
    );
    expect(m.date).toBe('2026-11-03');
  });
});

describe('başlık kuralı (9 Kasım canlı denemesinden)', () => {
  it('kaçırılan ilgili haberler kabul, protokol/toplantı red', async () => {
    const { baslikKarari } = await import('./analiz');
    for (const b of [
      'TURUNÇGİL BAHÇELERİNDE KASIM AYI MÜCADELE PLANI',
      'Uşak’ta Arıcılık ve Örtü Altı Üretime Destek',
      '2027 YILI BESİLİK SIĞIR İTHALATI İÇİN MÜRACAATLAR BAŞLADI',
      'Batman’da Mercimek Üretimine Güçlü Destek',
      'ESKİŞEHİR’DE TOPRAK ANALİZİNİN ÖNEMİ VE TOPRAĞA UYGUN GÜBRELEME TEKNİKLERİ EĞİTİMİ',
      'Giresun’da Damızlık Manda Boğası Dağıtıldı',
    ])
      expect(baslikKarari(b), b).toBe('kabul');
    for (const b of [
      'VAKIFBANK ERZURUM BÖLGE MÜDÜRÜ, İL MÜDÜRLÜĞÜMÜZE ZİYARETTE BULUNDU',
      'Ulusal Staj Programı 2027 Yılı Başvuruları',
      'SÖZLEŞMELİ PERSONELİN İNTİBAK EĞİTİM PROGRAMI BAŞLADI',
      'Islah Amaçlı Kiralama İhalesi',
      'MASA TENİSİ TAKIMIMIZ TÜRKİYE FİNALİNDE!',
      'Sayın Bakanımız Kayısı Hasadına Katıldı',
      'HAKKARİ İL TARIM VE ORMAN MÜDÜRLÜĞÜ PERSONELİNE İŞ SAĞLIĞI VE GÜVENLİĞİ EĞİTİMİ VERİLDİ',
    ])
      expect(baslikKarari(b), b).toBe('red');
    expect(baslikKarari('Tarsuslu Üreticilerimize Geçmiş Olsun')).toBeNull();
  });
});

describe('metni <p> içinde olmayan sayfa', () => {
  it('uzun metin düğümleri alınır', async () => {
    const { extractArticle } = await import('./html');
    const govde =
      'Turunçgil bahçelerinde kasım ayında yapılacak mücadele çalışmaları hakkında üreticilerimize bilgi verilmiştir.';
    const m = extractArticle(
      `<html><title>T</title><body><div class="icerik"><span>${govde}</span></div></body></html>`,
      'https://a.gov.tr/Haber/1/x',
    );
    expect(m.text).toContain('Turunçgil bahçelerinde');
  });
});

describe('başlık kuralı: "kuruldu" ve "iş günü" yanlış red olmaz', () => {
  it('kurulum ve süre ifadeleri red sayılmaz', async () => {
    const { baslikKarari } = await import('./analiz');
    expect(
      baslikKarari("Adıyaman'da badem bahçesine yüzey altı damla sulama sistemi kuruldu"),
    ).toBe('kabul');
    expect(
      baslikKarari(
        'Uydu destekli ürün tespit raporları askıda; itiraz için 5 iş günü süre içinde başvuru',
      ),
    ).toBe('kabul');
    expect(baslikKarari('İl Hayvanları Koruma Kurulu Toplantısı Gerçekleştirildi')).toBe('red');
    expect(baslikKarari('15 Ekim Dünya Kadın Çiftçiler Günü')).toBe('red');
    expect(baslikKarari('Çiftçilere Yönelik Bilgilendirme Toplantısı Düzenlendi')).toBe('kabul');
    expect(baslikKarari('Koordinasyon ve Değerlendirme Toplantısı Gerçekleştirildi')).toBe('red');
    expect(baslikKarari('Bakan Çiftçi Eğitim Merkezini Ziyaret Etti')).toBe('red');
  });
});
