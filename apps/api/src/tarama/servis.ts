import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DataService } from '../data.service';
import { parseRobots, robotsAllows, type RobotsRules } from '../market/robots';
import { CLOCK } from '../weather/tokens';
import type { HaberAnalizci } from './analiz';
import { extractArticle, extractListItems, type ListeOgesi } from './html';

export const TARAMA_FETCH = Symbol('TARAMA_FETCH');
export const TARAMA_ANALIZ = Symbol('TARAMA_ANALIZ');
export const USER_AGENT = 'TarimPusulaBot/0.1 (resmi duyuru okuyucu; egitim projesi)';

/** İlk taramada yalnız en yeni bu kadar haber alınır, kalanı "görüldü" sayılır (eski arşiv akmasın). */
const ILK_TARAMA_EN_COK = 3;
/** Bir turda kaynak başına en çok yeni haber. */
const TUR_EN_COK = 6;
/** Haber bu günden eskiyse alınmaz. */
const EN_ESKI_GUN = 45;
const MAX_BYTES = 1_500_000;

export interface KaynakSatiri {
  id: string;
  name: string;
  kind: string;
  province: string | null;
  district: string | null;
  url: string;
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
  /** Testte bekleme süresi kısaltılır. */
  pauseMs = 1000;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(TARAMA_FETCH) private readonly fetchFn: typeof fetch,
    @Inject(TARAMA_ANALIZ) private readonly analizci: HaberAnalizci,
  ) {}

  onModuleInit(): void {
    // Günde TARAMA_GUNDE kez (varsayılan 5; 0 kapatır). Test ve geliştirmede kapalıdır: HABER_TARAMA=1 ister.
    if (process.env['HABER_TARAMA'] !== '1') return;
    const perDay = Number(process.env['TARAMA_GUNDE'] ?? 5);
    if (!Number.isFinite(perDay) || perDay <= 0) return;
    const ms = Math.floor(86_400_000 / perDay);
    this.timer = setInterval(() => void this.runAll().catch(console.error), ms);
    this.timer.unref?.();
    // Açılıştan 2 dk sonra ilk tur (sunucu ısınsın).
    setTimeout(() => void this.runAll().catch(console.error), 120_000).unref?.();
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
    try {
      const sources = await this.data.system((q) =>
        q.query<KaynakSatiri>(
          `SELECT id, name, kind, province, district, url FROM official_sources
           WHERE active ORDER BY last_checked_at NULLS FIRST`,
        ),
      );
      const out: KaynakSonucu[] = [];
      for (const s of sources) {
        out.push(await this.runOne(s));
        await bekle(this.pauseMs);
      }
      return out;
    } finally {
      this.running = false;
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
        yeni = await this.isle(s, extractListItems(list.text, s.url), robots);
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

  private async isle(s: KaynakSatiri, items: ListeOgesi[], robots: RobotsRules): Promise<number> {
    if (items.length === 0) return 0;
    const seen = new Set(
      (
        await this.data.system((q) =>
          q.query<{ url: string }>(`SELECT url FROM scan_seen WHERE source_id = $1`, [s.id]),
        )
      ).map((r) => r.url),
    );
    const first = seen.size === 0;
    const cutoff = new Date(this.now().getTime() - EN_ESKI_GUN * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const fresh = items.filter((i) => !seen.has(i.url));
    // Haber numarası büyük = yeni (…/Haber/512/…): yeniden eskiye.
    const no = (u: string) => Number(/\/(\d+)\//.exec(u)?.[1] ?? 0);
    fresh.sort((a, b) => no(b.url) - no(a.url));
    const al = fresh.slice(0, first ? ILK_TARAMA_EN_COK : TUR_EN_COK);
    const catalog = await this.data.system((q) => q.query<{ id: string }>(`SELECT id FROM crops`));
    const urunler = catalog.map((c) => c.id);
    const tamam: ListeOgesi[] = [];
    let yeni = 0;
    for (const it of al) {
      if (!robotsAllows(robots, new URL(it.url).pathname)) {
        tamam.push(it);
        continue;
      }
      try {
        const page = await this.get(it.url);
        if (page.status >= 400 || !page.text) continue;
        const a = extractArticle(page.text, it.url);
        const date = it.date ?? a.date;
        tamam.push(it);
        if (date && date < cutoff) continue;
        const baslik = it.title.length >= 8 ? it.title : a.title;
        const r = await this.analizci.analiz(
          {
            kaynak: { ad: s.name, tur: s.kind, il: s.province, ilce: s.district },
            baslik,
            metin: a.text,
          },
          urunler,
        );
        if (!r.ilgili) continue;
        yeni += await this.yaz(s, it.url, r, a.image, date);
        await bekle(this.pauseMs);
      } catch (e) {
        // Geçici hata: bu haber "görüldü" sayılmaz, sonraki turda yeniden denenir.
        console.warn('haber atlandı:', it.url, (e as Error).message);
      }
    }
    // İlk taramada alınmayan eski haberler de görüldü sayılır; sonraki turlarda yalnız işlenenler.
    const mark = first ? fresh.filter((f) => !al.includes(f) || tamam.includes(f)) : tamam;
    await this.data.system(async (q) => {
      for (const m of mark) {
        await q.query(
          `INSERT INTO scan_seen(source_id, url) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [s.id, m.url],
        );
      }
    });
    return yeni;
  }

  private async yaz(
    s: KaynakSatiri,
    url: string,
    r: { baslik: string; ozet: string; urunler: string[]; kategori: string },
    image: string | null,
    date: string | null,
  ): Promise<number> {
    const places =
      s.district && s.province
        ? [{ province: s.province, district: s.district }]
        : s.province
          ? [{ province: s.province }]
          : [];
    const yayin = date ? new Date(`${date}T09:00:00+03:00`) : this.now();
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
           review_status, category, auto, source_site_id, image_url)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,'taslak-uzman-onayi-bekliyor',$7,true,$8,$9)
         ON CONFLICT (source_url) WHERE auto DO NOTHING RETURNING id`,
        [
          s.name,
          r.baslik,
          govde,
          url,
          yayin,
          JSON.stringify({ places, circle: null, cropIds: r.urunler }),
          r.kategori,
          s.id,
          image,
        ],
      ),
    );
    return rows.length;
  }
}
