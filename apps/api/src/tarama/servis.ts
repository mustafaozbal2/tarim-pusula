import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DataService } from '../data.service';
import { parseRobots, robotsAllows, type RobotsRules } from '../market/robots';
import { CLOCK } from '../weather/tokens';
import { baslikKarari, kisalt, urunleriBul, type HaberAnalizci } from './analiz';
import {
  baglantiKalibi,
  extractArticle,
  extractListItems,
  extractTuik,
  siraNo,
  type ListeOgesi,
} from './html';
import { yeniKayitDurumu } from '../onay';
import { ilceleriBul } from './ilce';
import { bitisAni, sonTarih, VARSAYILAN_GUN } from './sure';
import { PLACES } from '../controllers.g2';
import type { Places } from '../places';
import { Optional } from '@nestjs/common';

export const TARAMA_FETCH = Symbol('TARAMA_FETCH');
export const TARAMA_ANALIZ = Symbol('TARAMA_ANALIZ');
export const USER_AGENT = 'TarimPusulaBot/0.1 (resmi duyuru okuyucu; egitim projesi)';

/** İlk taramada kaynak başına en çok bu kadar haber değerlendirilir, kalanı "görüldü" sayılır (eski arşiv akmasın). */
const ILK_TARAMA_EN_COK = 10;
/** Bir turda kaynak başına en çok yeni haber. */
const TUR_EN_COK = 10;
/** Ülke geneli kaynaklar (kurum, enstitü, istatistik) herkese gider: tur başına daha az haber alınır. */
const ULKE_EN_COK = 4;
/** Haber bu günden eskiyse alınmaz. */
export const HABER_EN_ESKI_GUN = 45;
/**
 * Duyuru (hibe, destek, başvuru, kayıt) haber gibi çabuk eskimez: il müdürlüğü sitelerinde "destekler devam ediyor",
 * "ÇKS başvuruları" gibi duyurular aylarca geçerlidir. 15.11.2026 canlı incelemesi: Gaziantep'te 3 geçerli destek
 * duyurusu yalnız 45 gün kuralı yüzünden çiftçiye ulaşmamıştı. Sınır bizim seçimimizdir (literatür sabiti değil).
 */
export const DUYURU_EN_ESKI_GUN = 120;
const MAX_BYTES = 1_500_000;
/** Tur aralığı denetimi: sunucu yeniden başlasa da günde TARAMA_GUNDE tur korunur (son tur veritabanından okunur). */
const DENETIM_MS = 10 * 60_000;

const GENEL_YAZI =
  /^(devam[ıi]n?[ıi]? ?(oku)?|detay(lar)?|t[üu]m[üu]|daha fazla|haberin devam[ıi]|oku|incele)\b/i;

/** Bağlantı bir duyuru sayfası mı (haber değil)? */
export const duyuruMu = (url: string): boolean => /\/[a-z-]*duyuru/i.test(url);

export interface KaynakSatiri {
  id: string;
  name: string;
  kind: string;
  province: string | null;
  district: string | null;
  url: string;
  link_pattern?: string | null;
  format?: string | null;
}

export interface KaynakSonucu {
  kaynak: string;
  durum: string;
  yeni: number;
}

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class TaramaService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** Bu turda değerlendirilen haber sayısı (tur kaydı için). */
  private degerlendirilen = 0;
  /** Testte bekleme süresi kısaltılır. */
  pauseMs = 1000;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(TARAMA_FETCH) private readonly fetchFn: typeof fetch,
    @Inject(TARAMA_ANALIZ) private readonly analizci: HaberAnalizci,
    @Optional() @Inject(PLACES) private readonly places?: Places,
  ) {}

  /** Değerlendirilen haberin sonucu (neden haber olmadı?); kayıt hatası taramayı durdurmaz. */
  private async kayit(
    s: KaynakSatiri,
    url: string,
    title: string | null,
    outcome: string,
    reason: string | null,
  ) {
    this.degerlendirilen += 1;
    try {
      await this.data.system((q) =>
        q.query(
          `INSERT INTO scan_log(source_id, url, title, outcome, reason, analyzer) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            s.id,
            url,
            title?.slice(0, 300) ?? null,
            outcome,
            reason?.slice(0, 500) ?? null,
            this.analizci.id,
          ],
        ),
      );
    } catch {
      // kayıt opsiyonel
    }
  }

  onModuleInit(): void {
    // Günde TARAMA_GUNDE kez (varsayılan 5; 0 kapatır). Test ve geliştirmede kapalıdır: HABER_TARAMA=1 ister.
    if (process.env['HABER_TARAMA'] !== '1') return;
    const perDay = Number(process.env['TARAMA_GUNDE'] ?? 5);
    if (!Number.isFinite(perDay) || perDay <= 0) return;
    const aralik = Math.floor(86_400_000 / perDay);
    // Sabit sayaç yerine saat denetimi: ücretsiz sunucu uyuyup uyanınca sayaç sıfırlanıyor, turlar kayıyordu.
    // Her 10 dakikada "son turun üstünden aralık kadar süre geçti mi?" diye bakılır.
    const denetle = () => void this.zamaniGeldiyse(aralik).catch(console.error);
    this.timer = setInterval(denetle, DENETIM_MS);
    this.timer.unref?.();
    // Açılıştan 2 dk sonra ilk denetim (sunucu ısınsın).
    setTimeout(denetle, 120_000).unref?.();
  }

  /** Son turdan bu yana `aralikMs` geçtiyse yeni tur başlatır. */
  async zamaniGeldiyse(aralikMs: number): Promise<boolean> {
    if (this.running) return false;
    const [son] = await this.data.system((q) =>
      q.query<{ at: Date | string }>(`SELECT max(started_at) AS at FROM scan_runs`),
    );
    const sonAn = son?.at ? new Date(son.at).getTime() : 0;
    if (this.now().getTime() - sonAn < aralikMs) return false;
    await this.runAll();
    return true;
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async get(url: string): Promise<{ status: number; text: string }> {
    const res = await this.fetchFn(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(40_000),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return { status: res.status, text: '' };
    return { status: res.status, text: new TextDecoder('utf-8').decode(buf) };
  }

  async runAll(): Promise<KaynakSonucu[]> {
    if (this.running) return [];
    this.running = true;
    this.degerlendirilen = 0;
    const out: KaynakSonucu[] = [];
    let turId: string | null = null;
    let hata: string | null = null;
    try {
      const [tur] = await this.data.system((q) =>
        q.query<{ id: string }>(`INSERT INTO scan_runs(started_at) VALUES ($1) RETURNING id`, [
          this.now(),
        ]),
      );
      turId = tur?.id ?? null;
      const sources = await this.data.system((q) =>
        q.query<KaynakSatiri>(
          `SELECT id, name, kind, province, district, url, link_pattern, format FROM official_sources
           WHERE active ORDER BY last_checked_at NULLS FIRST`,
        ),
      );
      for (const s of sources) {
        out.push(await this.runOne(s));
        await bekle(this.pauseMs);
      }
      return out;
    } catch (e) {
      hata = (e as Error).message.slice(0, 300);
      throw e;
    } finally {
      this.running = false;
      if (turId) {
        const yeni = out.reduce((t, k) => t + k.yeni, 0);
        await this.data
          .system((q) =>
            q.query(
              `UPDATE scan_runs SET finished_at = $2, sources = $3, evaluated = $4, new_count = $5, error = $6
               WHERE id = $1`,
              [turId, this.now(), out.length, this.degerlendirilen, yeni, hata],
            ),
          )
          .catch(() => undefined);
      }
    }
  }

  async runOne(s: KaynakSatiri): Promise<KaynakSonucu> {
    let durum = 'tamam';
    let yeni = 0;
    try {
      const base = new URL(s.url);
      const robots = parseRobots(
        (await this.get(`${base.origin}/robots.txt`).catch(() => ({ text: '' }))).text,
        'tarimpusulabot',
      );
      if (!robotsAllows(robots, base.pathname || '/')) {
        durum = 'robots.txt tarama izni vermiyor';
      } else {
        const list = await this.get(s.url);
        if (list.status >= 400) throw new Error(`liste ${list.status}`);
        const ogeler =
          s.format === 'tuik'
            ? extractTuik(list.text)
            : extractListItems(list.text, s.url, baglantiKalibi(s.link_pattern));
        yeni =
          s.format === 'tuik' ? await this.isleTuik(s, ogeler) : await this.isle(s, ogeler, robots);
      }
    } catch (e) {
      durum = `hata: ${(e as Error).message}`.slice(0, 200);
    }
    await this.data.system((q) =>
      q.query(
        `UPDATE official_sources SET last_checked_at = $2, last_status = $3, last_new_count = $4 WHERE id = $1`,
        [s.id, this.now(), durum, yeni],
      ),
    );
    return { kaynak: s.name, durum, yeni };
  }

  private async goruldu(s: KaynakSatiri): Promise<Set<string>> {
    const rows = await this.data.system((q) =>
      q.query<{ url: string }>(`SELECT url FROM scan_seen WHERE source_id = $1`, [s.id]),
    );
    return new Set(rows.map((r) => r.url));
  }

  private async gorulduYaz(s: KaynakSatiri, ogeler: ListeOgesi[]): Promise<void> {
    await this.data.system(async (q) => {
      for (const m of ogeler) {
        await q.query(
          `INSERT INTO scan_seen(source_id, url) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [s.id, m.url],
        );
      }
    });
  }

  private async urunKimlikleri(): Promise<string[]> {
    const catalog = await this.data.system((q) => q.query<{ id: string }>(`SELECT id FROM crops`));
    return catalog.map((c) => c.id);
  }

  /**
   * TÜİK haber bültenleri: bülten metni alınamadığından (yalnız TÜİK veri portalı uygulamasında açılır) yapay zekâ
   * özeti üretilmez; karta bültenin adı ve dönemi yazılır, çiftçi "Kaynağı aç" ile bültenin kendisine gider.
   */
  private async isleTuik(s: KaynakSatiri, items: ListeOgesi[]): Promise<number> {
    if (items.length === 0) return 0;
    const seen = await this.goruldu(s);
    const fresh = items.filter((i) => !seen.has(i.url)).slice(0, ULKE_EN_COK);
    const urunler = await this.urunKimlikleri();
    let yeni = 0;
    for (const it of fresh) {
      const n = await this.yaz(
        s,
        it.url,
        {
          baslik: kisalt(`TÜİK: ${it.title}`, 160),
          ozet:
            `Türkiye İstatistik Kurumu "${it.title}" haber bültenini yayımladı. ` +
            'Rakamlar, tablolar ve grafikler bültenin kendisindedir.',
          urunler: urunleriBul(it.title, urunler),
          kategori: 'guncel',
        },
        null,
        null,
      );
      yeni += n;
      await this.kayit(s, it.url, it.title, 'eklendi', 'TÜİK bülten şeridi');
    }
    await this.gorulduYaz(s, fresh);
    return yeni;
  }

  private async isle(s: KaynakSatiri, items: ListeOgesi[], robots: RobotsRules): Promise<number> {
    if (items.length === 0) return 0;
    const seen = await this.goruldu(s);
    const first = seen.size === 0;
    const gunOnce = (g: number) =>
      new Date(this.now().getTime() - g * 86_400_000).toISOString().slice(0, 10);
    const haberSiniri = gunOnce(HABER_EN_ESKI_GUN);
    const duyuruSiniri = gunOnce(DUYURU_EN_ESKI_GUN);
    const fresh = items.filter((i) => !seen.has(i.url));
    // Yeniden eskiye; duyurular (hibe, destek, başvuru) haberlerden önce değerlendirilir.
    fresh.sort(
      (a, b) => Number(duyuruMu(b.url)) - Number(duyuruMu(a.url)) || siraNo(b.url) - siraNo(a.url),
    );
    const ulke = !s.province;
    const al = fresh.slice(0, ulke ? ULKE_EN_COK : first ? ILK_TARAMA_EN_COK : TUR_EN_COK);
    const urunler = await this.urunKimlikleri();
    const tamam: ListeOgesi[] = [];
    let yeni = 0;
    const bugun = new Date(this.now().getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    for (const it of al) {
      if (!robotsAllows(robots, new URL(it.url).pathname)) {
        tamam.push(it);
        await this.kayit(s, it.url, it.title, 'robots', 'robots.txt bu sayfaya izin vermiyor');
        continue;
      }
      try {
        const page = await this.get(it.url);
        if (page.status >= 400 || !page.text) {
          await this.kayit(s, it.url, it.title, 'hata', `sayfa ${page.status}`);
          continue;
        }
        const a = extractArticle(page.text, it.url);
        const date = it.date ?? a.date;
        tamam.push(it);
        // "Devamını oku" gibi genel bağlantı yazısı başlık değildir: sayfanın kendi başlığı kullanılır.
        const baslik = it.title.length >= 8 && !GENEL_YAZI.test(it.title) ? it.title : a.title;
        const karar = baslikKarari(baslik);
        const duyuru = duyuruMu(it.url);
        // Duyuru 45 günden eskiyse yalnız başlığı açıkça destek/başvuru/mücadele türündeyse alınır.
        const uzun = duyuru && karar === 'kabul';
        if (date && date < (uzun ? duyuruSiniri : haberSiniri)) {
          const gun = uzun ? DUYURU_EN_ESKI_GUN : HABER_EN_ESKI_GUN;
          await this.kayit(s, it.url, it.title, 'eski', `yayın ${date} (${gun} günden eski)`);
          continue;
        }
        // Başvuru süresi geçmiş duyuru hiç eklenmez; geçerli olan bitiş gününün sonunda kalkar.
        const son = sonTarih(`${baslik}\n${a.text}`, bugun);
        if (son && son < bugun) {
          await this.kayit(s, it.url, baslik, 'suresi-gecmis', `bitiş ${son}`);
          continue;
        }
        if (a.text.trim().length < 40) {
          await this.kayit(
            s,
            it.url,
            baslik,
            'metin-yok',
            'sayfada okunabilir metin yok (yalnız başlık)',
          );
        }
        const r = await this.analizci.analiz(
          {
            kaynak: { ad: s.name, tur: s.kind, il: s.province, ilce: s.district },
            baslik,
            metin: a.text,
          },
          urunler,
        );
        // Başlık kuralı yapay zekâdan önce gelir (protokol/toplantı red; destek/başvuru/mücadele kabul).
        let ilgili = karar === 'red' ? false : karar === 'kabul' ? true : r.ilgili;
        let neden: string = karar === 'red' ? 'başlık kuralı' : r.kategori;
        // Ülke geneli kaynak herkese gider: enstitü haberi yalnız bir ürünle ya da açık bir çiftçi konusuyla
        // ilgiliyse alınır (kurum içi haberler akmasın).
        if (ilgili && ulke && s.kind === 'enstitu' && karar !== 'kabul' && r.urunler.length === 0) {
          ilgili = false;
          neden = 'enstitü haberi: ürün ya da çiftçi konusu yok';
        }
        if (!ilgili) {
          await this.kayit(s, it.url, baslik, 'ilgisiz', `${neden}: ${r.ozet.slice(0, 200)}`);
          continue;
        }
        const ilceler =
          s.province && !s.district && this.places
            ? ilceleriBul(baslik, a.text, s.province, this.places.districts(s.province))
            : [];
        const n = await this.yaz(s, it.url, r, a.image, date, son, ilceler, duyuru);
        yeni += n;
        await this.kayit(
          s,
          it.url,
          baslik,
          'eklendi',
          [son ? `bitiş ${son}` : null, ilceler.length ? `ilçe ${ilceler.join(', ')}` : null]
            .filter(Boolean)
            .join('; ') || null,
        );
        await bekle(this.pauseMs);
      } catch (e) {
        // Geçici hata: bu haber "görüldü" sayılmaz, sonraki turda yeniden denenir.
        console.warn('haber atlandı:', it.url, (e as Error).message);
        await this.kayit(s, it.url, it.title, 'hata', (e as Error).message);
      }
    }
    // İlk taramada alınmayan eski haberler de görüldü sayılır; sonraki turlarda yalnız işlenenler.
    const mark = first ? fresh.filter((f) => !al.includes(f) || tamam.includes(f)) : tamam;
    await this.gorulduYaz(s, mark);
    return yeni;
  }

  private async yaz(
    s: KaynakSatiri,
    url: string,
    r: { baslik: string; ozet: string; urunler: string[]; kategori: string },
    image: string | null,
    date: string | null,
    son: string | null = null,
    ilceler: string[] = [],
    duyuru = false,
  ): Promise<number> {
    const places =
      s.district && s.province
        ? [{ province: s.province, district: s.district }]
        : s.province && ilceler.length
          ? ilceler.map((d) => ({ province: s.province!, district: d }))
          : s.province
            ? [{ province: s.province }]
            : [];
    const yayin = date ? new Date(`${date}T09:00:00+03:00`) : this.now();
    // Bitiş: başvuru son günü; yoksa haber yayından VARSAYILAN_GUN, duyuru DUYURU_EN_ESKI_GUN sonra kalkar.
    const omur = duyuru ? DUYURU_EN_ESKI_GUN : VARSAYILAN_GUN;
    const bitis = son ? bitisAni(son) : new Date(yayin.getTime() + omur * 86_400_000);
    const govde = [
      r.ozet,
      date ? '' : 'Yayın tarihi kaynakta bulunamadı; alındığı gün gösteriliyor.',
      'Özgün haber ve başvuru bağlantısı için "Kaynağı aç" düğmesine dokun.',
    ]
      .filter(Boolean)
      .join('\n\n');
    const rows = await this.data.system((q) =>
      q.query(
        `INSERT INTO announcements(source_org, title, body, source_url, published_at, targeting,
           review_status, category, auto, source_site_id, image_url, expires_at, apply_until)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,true,$9,$10,$11,$12)
         ON CONFLICT (source_url) WHERE auto DO NOTHING RETURNING id`,
        [
          s.name,
          r.baslik,
          govde,
          url,
          yayin,
          JSON.stringify({ places, circle: null, cropIds: r.urunler }),
          // Onay kapalıyken resmî kaynak haberi doğrudan yayındadır (apps/api/src/onay.ts).
          yeniKayitDurumu(),
          r.kategori,
          s.id,
          image,
          bitis > yayin ? bitis : new Date(yayin.getTime() + 86_400_000),
          son,
        ],
      ),
    );
    return rows.length;
  }
}
