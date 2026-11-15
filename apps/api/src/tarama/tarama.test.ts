import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { importCropCatalog } from '../crops';
import { DataService } from '../data.service';
import { migrate, PgliteDb, systemTx } from '../db/db';
import { DOZ, KuralAnalizci, NuviaAnalizci, guvenliAnaliz, kisalt, urunleriBul } from './analiz';
import {
  baglantiKalibi,
  decodeEntities,
  extractArticle,
  extractListItems,
  extractTuik,
  siraNo,
  trDate,
} from './html';
import { importResmiKaynaklar } from './kaynak';
import { duyuruMu, TaramaService } from './servis';

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

  it('kaynak CSV: 81 il müdürlüğü + ülke geneli kaynaklar; hepsi https; robots.txt izni vermeyen siteler yok; tekrar yüklemek çift kayıt açmaz', async () => {
    const db = new PgliteDb();
    await migrate(db);
    const ilk = await importResmiKaynaklar(db);
    expect(ilk).toBeGreaterThanOrEqual(100);
    expect(await importResmiKaynaklar(db)).toBe(0);
    const rows = await systemTx(db, (q) =>
      q.query<{ url: string; kind: string; province: string | null; format: string }>(
        `SELECT url, kind, province, format FROM official_sources`,
      ),
    );
    const il = rows.filter((r) => r.kind === 'il_mudurlugu');
    expect(il).toHaveLength(81);
    for (const r of il) expect(r.url).toMatch(/^https:\/\/[a-z]+\.tarimorman\.gov\.tr\/$/);
    for (const r of rows) expect(r.url).toMatch(/^https:\/\//);
    // Bakanlık ana sitesi ve DSİ robots.txt ile taramayı yasaklıyor: listede olamaz (kural 6).
    expect(rows.some((r) => /^https:\/\/(www\.)?tarimorman\.gov\.tr/.test(r.url))).toBe(false);
    expect(rows.some((r) => r.url.includes('dsi.gov.tr'))).toBe(false);
    // Ülke geneli kaynakların ili yoktur; TÜİK kendi biçimiyle okunur.
    const ulke = rows.filter((r) => r.kind !== 'il_mudurlugu');
    expect(ulke.every((r) => r.province === null)).toBe(true);
    expect(rows.find((r) => r.url.includes('tuik.gov.tr'))?.format).toBe('tuik');
  }, 60_000);
});

describe('G36: duyuru ömrü, ülke geneli kaynak, TÜİK, tur kaydı', () => {
  const sayfa = (govde: string) => `<html><title>t</title><body><p>${govde}</p></body></html>`;

  async function kur2(
    kaynak: {
      kind: string;
      province: string | null;
      url: string;
      pattern?: string;
      format?: string;
    },
    yanit: (url: string) => string,
    now = '2026-11-15T07:00:00Z',
  ) {
    const db = new PgliteDb();
    await migrate(db);
    await importCropCatalog(db);
    await systemTx(db, (q) =>
      q.query(
        `INSERT INTO official_sources(name, kind, province, url, link_pattern, format)
         VALUES ('Kaynak', $1, $2, $3, $4, $5)`,
        [kaynak.kind, kaynak.province, kaynak.url, kaynak.pattern ?? null, kaynak.format ?? 'html'],
      ),
    );
    const f = (async (u: string | URL) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
      return new Response(yanit(url));
    }) as unknown as typeof fetch;
    const saat = { an: new Date(now) };
    const svc = new TaramaService(
      new DataService(db as never),
      () => saat.an,
      f,
      new KuralAnalizci(),
    );
    svc.pauseMs = 0;
    const duyurular = () =>
      systemTx(db, (q) =>
        q.query<{
          title: string;
          review_status: string;
          targeting: { places: unknown[] };
          apply_until: string | null;
          expires_at: Date;
          published_at: Date;
        }>(
          `SELECT title, review_status, targeting, apply_until::text, expires_at, published_at
           FROM announcements WHERE auto ORDER BY title`,
        ),
      );
    return { db, svc, saat, duyurular };
  }

  it('destek duyurusu 45 günden eski olsa da (120 güne kadar) alınır; aynı yaştaki haber alınmaz', async () => {
    const liste = `<a Yayin="18.09.2026" href="/Duyuru/416/Sulama-Destekleri">Tasarruflu sulama sistemlerine yönelik destekleme başvuruları sürüyor</a>
      <a Yayin="18.09.2026" href="/Haber/500/Hasat">Zeytin hasadı başladı</a>
      <a Yayin="05.08.2026" href="/Duyuru/412/Karantina">Yeni bitki karantinası yönetmeliği hakkında</a>
      <a Yayin="10.06.2026" href="/Duyuru/409/Eski-Destek">Küçükbaş destek başvuru sonuçları açıklandı</a>`;
    const { svc, duyurular, db } = await kur2(
      { kind: 'il_mudurlugu', province: 'Gaziantep', url: 'https://gaziantep.tarimorman.gov.tr/' },
      (u) =>
        u.endsWith('/')
          ? liste
          : sayfa(
              'Çiftçilerimizin damla sulama yatırımlarına hibe desteği verilmektedir, il müdürlüğüne başvurun.',
            ),
    );
    const r = await svc.runAll();
    expect(r[0]!.yeni).toBe(1);
    const d = await duyurular();
    expect(d.map((x) => x.title)).toEqual([
      'Tasarruflu sulama sistemlerine yönelik destekleme başvuruları sürüyor',
    ]);
    // Duyuru yayından 120 gün sonra kalkar (haber 45 gün).
    const omurGun =
      (new Date(d[0]!.expires_at).getTime() - new Date(d[0]!.published_at).getTime()) / 86_400_000;
    expect(omurGun).toBe(120);
    const kayit = await systemTx(db, (q) =>
      q.query<{ outcome: string; reason: string | null }>(
        `SELECT outcome, reason FROM scan_log ORDER BY id`,
      ),
    );
    expect(kayit.filter((k) => k.outcome === 'eski')).toHaveLength(3);
    expect(kayit.some((k) => /120 günden eski/.test(k.reason ?? ''))).toBe(true);
  }, 60_000);

  it('başvuru son günü metinden bulunur ve duyuruya yazılır', async () => {
    const liste = `<a Yayin="10.11.2026" href="/Duyuru/430/Fidan">Sertifikalı fidan desteği başvuruları</a>`;
    const { svc, duyurular } = await kur2(
      { kind: 'il_mudurlugu', province: 'Isparta', url: 'https://isparta.tarimorman.gov.tr/' },
      (u) =>
        u.endsWith('/')
          ? liste
          : sayfa(
              'Sertifikalı fidan desteği için başvurular 30 Kasım 2026 tarihine kadar ilçe müdürlüklerine yapılacaktır.',
            ),
    );
    await svc.runAll();
    const [d] = await duyurular();
    expect(d!.apply_until).toBe('2026-11-30');
  }, 60_000);

  it('ülke geneli kurum: siteye özel bağlantı kalıbı, hedef tüm ülke; enstitü haberi ürün ya da çiftçi konusu yoksa alınmaz', async () => {
    const tkdk = await kur2(
      {
        kind: 'kurum',
        province: null,
        url: 'https://www.tkdk.gov.tr/',
        pattern: '^/(Duyuru|Haber)/[a-z0-9-]+-[0-9]+$',
      },
      (u) =>
        u.endsWith('/')
          ? `<a href="/Duyuru/ipard-iii-12-basvuru-cagri-ilani-13121">IPARD III 12. başvuru çağrı ilanı yayımlandı</a>
             <a href="/Duyuru/IKDuyuru">İnsan kaynakları duyuruları</a>
             <a href="/Sayfa/hakkimizda-12">Hakkımızda</a>`
          : sayfa(
              'Tarımsal işletmelerin fiziki varlıklarına yönelik yatırımlar için hibe başvuruları alınacaktır.',
            ),
    );
    const r = await tkdk.svc.runAll();
    expect(r[0]!.yeni).toBe(1);
    const [d] = await tkdk.duyurular();
    expect(d!.targeting.places).toEqual([]);

    const ens = await kur2(
      { kind: 'enstitu', province: null, url: 'https://arastirma.tarimorman.gov.tr/pamuk' },
      (u) =>
        u.endsWith('/pamuk')
          ? `<a href="/pamuk/Haber/90/Kutuphane">Enstitü kütüphanesi yenilendi, kaynak sayısı arttı</a>
             <a href="/pamuk/Haber/91/Pamuk-Cesit">Yeni pamuk çeşidi tescil edildi</a>`
          : u.includes('/91/')
            ? sayfa(
                'Enstitümüzün geliştirdiği yeni pamuk çeşidi tescil edilerek üreticinin kullanımına sunuldu.',
              )
            : sayfa(
                'Enstitümüzün kütüphanesi yenilenerek araştırmacıların hizmetine sunulmuştur, proje kapsamında.',
              ),
    );
    const e = await ens.svc.runAll();
    expect(e[0]!.yeni).toBe(1);
    expect((await ens.duyurular()).map((x) => x.title)).toEqual([
      'Yeni pamuk çeşidi tescil edildi',
    ]);
  }, 90_000);

  it('TÜİK: yalnız tarım bültenleri alınır; metin uydurulmaz (yalnız bülten adı ve dönemi)', async () => {
    const tuik = `<div id="x" class="carousel-inner">
      <div class="carousel-item" style="height:540px"><a href="#" onclick="SliderUrl('https://veriportali.tuik.gov.tr/tr/press/58323', event)">
        <div class="d-block hbranabaslik text-tuik-blue">&#x130;n&#x15F;aat &#xDC;retim Endeksi</div><div class="d-block hbraltbaslik">Eyl&#xFC;l 2026</div>
        <use xlink:href="/static/img/SVG/main_symbol.svg#tuik-icon-insaat_Konut_renkli"></use></a></div>
      <div class="carousel-item" style="height:540px"><a href="#" onclick="SliderUrl('https://veriportali.tuik.gov.tr/tr/press/58078', event)">
        <div class="d-block hbranabaslik text-tuik-blue">S&#xFC;t ve S&#xFC;t &#xDC;r&#xFC;nleri &#xDC;retimi</div><div class="d-block hbraltbaslik">Eyl&#xFC;l 2026</div>
        <use xlink:href="/static/img/SVG/main_symbol.svg#tuik-icon-Tarim_Orman_Balikcilik_renkli"></use></a></div></div>`;
    expect(extractTuik(tuik)).toEqual([
      {
        url: 'https://veriportali.tuik.gov.tr/tr/press/58078',
        title: 'Süt ve Süt Ürünleri Üretimi, Eylül 2026',
        date: null,
      },
    ]);
    const { svc, db } = await kur2(
      { kind: 'istatistik', province: null, url: 'https://www.tuik.gov.tr/', format: 'tuik' },
      () => tuik,
    );
    expect((await svc.runAll())[0]!.yeni).toBe(1);
    const [d] = await systemTx(db, (q) =>
      q.query<{ title: string; body: string; source_url: string }>(
        `SELECT title, body, source_url FROM announcements WHERE auto`,
      ),
    );
    expect(d!.title).toBe('TÜİK: Süt ve Süt Ürünleri Üretimi, Eylül 2026');
    expect(d!.source_url).toBe('https://veriportali.tuik.gov.tr/tr/press/58078');
    // Bülten metni alınmadığı için kartta rakam yoktur (uydurma yok).
    expect(d!.body.replace(/2026/g, '')).not.toMatch(/\d/);
    expect((await svc.runAll())[0]!.yeni).toBe(0);
  }, 60_000);

  it('tur kaydı: her tur scan_runs satırı bırakır; saat denetimi aralık dolmadan yeni tur başlatmaz', async () => {
    const { svc, db, saat } = await kur2(
      { kind: 'il_mudurlugu', province: 'Konya', url: 'https://konya.tarimorman.gov.tr/' },
      (u) =>
        u.endsWith('/')
          ? `<a Yayin="14.11.2026" href="/Duyuru/1/Tohum">Tohum desteği başvurusu</a>`
          : sayfa(
              'Sertifikalı tohum kullanan çiftçilere destek ödemesi için başvurular alınmaktadır.',
            ),
    );
    const aralik = Math.floor(86_400_000 / 5);
    expect(await svc.zamaniGeldiyse(aralik)).toBe(true);
    expect(await svc.zamaniGeldiyse(aralik)).toBe(false);
    saat.an = new Date(saat.an.getTime() + aralik + 1000);
    expect(await svc.zamaniGeldiyse(aralik)).toBe(true);
    const turlar = await systemTx(db, (q) =>
      q.query<{
        sources: number;
        evaluated: number;
        new_count: number;
        finished_at: Date | null;
      }>(`SELECT sources, evaluated, new_count, finished_at FROM scan_runs ORDER BY id`),
    );
    expect(turlar).toHaveLength(2);
    expect(turlar[0]).toMatchObject({ sources: 1, evaluated: 1, new_count: 1 });
    expect(turlar[0]!.finished_at).not.toBeNull();
    expect(turlar[1]).toMatchObject({ sources: 1, new_count: 0 });
  }, 60_000);

  it('yardımcılar: sıra numarası, bağlantı kalıbı, duyuru sayfası, Türkçe HTML varlıkları', () => {
    expect(siraNo('https://x.gov.tr/Haber/512/a')).toBe(512);
    expect(siraNo('https://www.tkdk.gov.tr/Duyuru/ipard-cagri-13121')).toBe(13121);
    expect(siraNo('https://x.org.tr/hasat-basladi-29-11-2026/')).toBe(20261129);
    expect(siraNo('https://x.gov.tr/Duyuru/Detay/04b58f63-6f3d')).toBe(0);
    expect(baglantiKalibi('(').source).toBe(baglantiKalibi(null).source);
    expect(duyuruMu('https://x.gov.tr/Duyuru/4/a')).toBe(true);
    expect(duyuruMu('https://x.gov.tr/kamuoyu-duyurulari/4/a')).toBe(true);
    expect(duyuruMu('https://x.gov.tr/Haber/4/a')).toBe(false);
    expect(
      decodeEntities('&uuml;reticilerimizin &Ccedil;ift&ccedil;i &Uuml;r&uuml;n &rsquo;e'),
    ).toBe('üreticilerimizin Çiftçi Ürün ’e');
  });
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
