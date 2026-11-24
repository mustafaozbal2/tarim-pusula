import { Controller, Get, Inject } from '@nestjs/common';
import {
  fieldCalendar,
  gecmisUyarilar,
  haftaAnahtari,
  haftalikFiyat,
  isActive,
  matchesField,
  matchSupports,
  needsDraftBadge,
  ozetAraligi,
  type FieldSite,
  type ReviewStatus,
  type SupportRecord,
  type Targeting,
  type UyariTuru,
} from '@tarim/agro-core';
import { Me } from './auth/access';
import { templatesForCrop } from './calendar';
import { PLACES } from './controllers.g2';
import { trToday } from './controllers.g4';
import { DataService } from './data.service';
import type { Principal, Queryable } from './db/db';
import type { Places } from './places';
import { CLOCK } from './weather/tokens';

/**
 * Kullanıcıya özel haftalık özet: çiftçinin il ve ürünlerine göre açık destek/hibe başvuruları (kaynak, son gün,
 * bağlantı), önümüzdeki 14 günün kritik tarihleri, geçen 7 günün uyarıları ve ürünlerinin hal fiyatı değişimi.
 * Yeni veri toplanmaz; mevcut tablolar okunur. Taslak (onaysız) kayıt öneri olarak girmez (kural 1).
 */

export interface OzetDestek {
  id: string;
  baslik: string;
  /** Başvuru son günü (YYYY-MM-DD); bilinmiyorsa null. */
  sonGun: string | null;
  kaynak: string;
  kaynakTarihi: string;
  kaynakUrl: string | null;
  tarlalar: string[];
}

export interface OzetTarih {
  tarih: string;
  baslik: string;
  tur: 'basvuru' | 'takvim';
  tarla: string | null;
  kaynak: string;
}

export interface OzetUyari {
  tur: UyariTuru;
  tarih: string;
  tarla: string;
}

export interface OzetFiyat {
  cropId: string;
  urun: string;
  yer: string;
  son: number;
  sonTarih: string;
  onceki: number;
  oncekiTarih: string;
  degisimPct: number;
  kaynak: string;
  kaynakUrl: string;
}

export interface HaftalikOzet {
  hafta: string;
  bugun: string;
  destekler: OzetDestek[];
  tarihler: OzetTarih[];
  uyarilar: OzetUyari[];
  fiyatlar: OzetFiyat[];
  /** Hiç tarlası yoksa ya da ürün seçilmemişse çiftçiye ne yapacağını söyler. */
  not: string | null;
}

interface Tarla {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  village: string | null;
  lat: number | null;
  lon: number | null;
  cropId: string | null;
  area: number | null;
}

/** Fiyat karşılaştırması için son kaç günün kaydı okunur (7 gün önceki kayıt 10 güne kadar aranır). */
const FIYAT_GUN = 21;
const EN_COK_DESTEK = 20;

const UYARI_ADI: Record<UyariTuru, string> = {
  don: 'don',
  kar: 'kar',
  ruzgar: 'kuvvetli rüzgâr',
  yagis: 'kuvvetli yağış',
};

/**
 * Özeti hesaplar. `q` kullanıcı bağlamında (RLS) ya da sistem bağlamında olabilir; tarlalar her durumda
 * `owner_id = userId` ile süzülür. `uyariAnahtarlari`: kullanıcının son 7 günlük gönderim kaydı anahtarları.
 */
export async function haftalikOzet(
  q: Queryable,
  userId: string,
  now: Date,
  places: Places,
  uyariAnahtarlari: readonly string[],
): Promise<HaftalikOzet> {
  const bugun = trToday(now);
  const { ileriSon } = ozetAraligi(bugun);
  const tarlalar = await q.query<Tarla>(
    `SELECT id, name, province, district, village, lat, lon, crop_id AS "cropId", area_decare AS area
     FROM fields WHERE owner_id = $1 ORDER BY created_at`,
    [userId],
  );
  const bos: HaftalikOzet = {
    hafta: haftaAnahtari(bugun),
    bugun,
    destekler: [],
    tarihler: [],
    uyarilar: [],
    fiyatlar: [],
    not: null,
  };
  if (!tarlalar.length) return { ...bos, not: 'Özet için önce bir arazi ekleyin.' };

  const siteler = tarlalar.map((f) => {
    const s: FieldSite = { ...f };
    if (!s.province && f.lat !== null && f.lon !== null) {
      const yakin = places.nearest(f.lat, f.lon);
      if (yakin) {
        s.province = yakin.province;
        s.district = s.district ?? yakin.district;
      }
    }
    return { f, s };
  });
  const adOf = new Map(tarlalar.map((f) => [f.id, f.name]));

  // Destekler (resmî destek kayıtları): yalnız şu an başvurusu açık olanlar.
  const destekKayitlari = await q.query<SupportRecord>(
    `SELECT id, title, summary, crop_ids AS "cropIds", provinces, min_area AS "minAreaDecare",
       max_area AS "maxAreaDecare", apply_from::text AS "applyFrom", apply_to::text AS "applyTo",
       review_status AS "reviewStatus", source, source_url AS "sourceUrl",
       source_version AS "sourceVersion", source_date::text AS "sourceDate"
     FROM supports ORDER BY id`,
  );
  const destekler = new Map<string, OzetDestek>();
  for (const { f, s } of siteler) {
    for (const m of matchSupports(destekKayitlari, {
      cropId: s.cropId,
      province: s.province,
      areaDecare: f.area,
      today: bugun,
    })) {
      if (m.status !== 'acik') continue;
      const d = m.support;
      const var_ = destekler.get(d.id);
      if (var_) var_.tarlalar.push(f.name);
      else
        destekler.set(d.id, {
          id: d.id,
          baslik: d.title,
          sonGun: d.applyTo ?? null,
          kaynak: d.source,
          kaynakTarihi: d.sourceDate,
          kaynakUrl: d.sourceUrl ?? null,
          tarlalar: [f.name],
        });
    }
  }

  // Kurum duyurularından başvuru son günü henüz geçmemiş olanlar (tarlalardan birine hedefliyse).
  const duyurular = await q.query<{
    id: string;
    sourceOrg: string;
    title: string;
    sourceUrl: string | null;
    publishedAt: string;
    expiresAt: string | null;
    targeting: Targeting;
    reviewStatus: ReviewStatus;
    applyUntil: string;
  }>(
    `SELECT id, source_org AS "sourceOrg", title, source_url AS "sourceUrl", published_at AS "publishedAt",
       expires_at AS "expiresAt", targeting, review_status AS "reviewStatus", apply_until::text AS "applyUntil"
     FROM announcements
     WHERE review_status <> 'reddedildi' AND apply_until >= $1::date AND published_at <= $2
       AND (expires_at IS NULL OR expires_at > $2)
     ORDER BY apply_until LIMIT 200`,
    [bugun, now],
  );
  for (const a of duyurular) {
    if (needsDraftBadge(a.reviewStatus) || !isActive(a, now)) continue;
    const uyan = siteler.filter(({ s }) => matchesField(a.targeting, s)).map(({ f }) => f.name);
    if (!uyan.length) continue;
    destekler.set(`duyuru-${a.id}`, {
      id: `duyuru-${a.id}`,
      baslik: a.title,
      sonGun: a.applyUntil,
      kaynak: a.sourceOrg,
      kaynakTarihi: new Date(a.publishedAt).toISOString().slice(0, 10),
      kaynakUrl: a.sourceUrl,
      tarlalar: uyan,
    });
  }
  const destekListesi = [...destekler.values()]
    .sort((a, b) => (a.sonGun ?? '9999').localeCompare(b.sonGun ?? '9999'))
    .slice(0, EN_COK_DESTEK);

  // Kritik tarihler: 14 gün içindeki başvuru son günleri ve onaylı ekim/ilaçlama/hasat takvimi.
  const tarihler: OzetTarih[] = destekListesi
    .filter((d) => d.sonGun && d.sonGun <= ileriSon)
    .map((d) => ({
      tarih: d.sonGun!,
      baslik: `Başvuru son günü: ${d.baslik}`,
      tur: 'basvuru' as const,
      tarla: null,
      kaynak: d.kaynak,
    }));
  const sablonlar = new Map<string, Awaited<ReturnType<typeof templatesForCrop>>>();
  for (const { f, s } of siteler) {
    if (!s.cropId) continue;
    if (!sablonlar.has(s.cropId)) sablonlar.set(s.cropId, await templatesForCrop(q, s.cropId));
    for (const e of fieldCalendar(s, sablonlar.get(s.cropId)!, bugun, 14)) {
      if (!e.actionable || e.needsBadge) continue;
      tarihler.push({
        tarih: e.start < bugun ? bugun : e.start,
        baslik: e.title,
        tur: 'takvim',
        tarla: f.name,
        kaynak: e.source,
      });
    }
  }
  tarihler.sort((a, b) => a.tarih.localeCompare(b.tarih));

  const uyarilar = gecmisUyarilar(uyariAnahtarlari)
    .filter((u) => adOf.has(u.fieldId))
    .map((u) => ({ tur: u.tur, tarih: u.tarih, tarla: adOf.get(u.fieldId)! }));

  // Hal fiyatı: her ürün için tarlanın ilindeki hal tercih edilir, yoksa en çok günü olan seri.
  const fiyatlar: OzetFiyat[] = [];
  const urunler = [...new Set(siteler.map(({ s }) => s.cropId).filter((c): c is string => !!c))];
  for (const cropId of urunler) {
    const satirlar = await q.query<{
      yer: string;
      il: string | null;
      urun: string;
      cropName: string;
      date: string;
      price: number;
      kaynak: string;
      url: string;
    }>(
      `SELECT pl.name AS yer, pl.province AS il, p.product_name AS urun, c.name_tr AS "cropName",
         p.price_date::text AS date, ((p.price_min + p.price_max) / 2)::float8 AS price,
         s.name AS kaynak, p.source_url AS url
       FROM market_prices p
       JOIN market_places pl ON pl.id = p.place_id
       JOIN market_sources s ON s.id = p.source_id
       JOIN crops c ON c.id = p.crop_id
       WHERE p.crop_id = $1 AND p.price_date > ($2::date - $3::int) AND p.price_date <= $2::date
         AND p.source_url IS NOT NULL`,
      [cropId, bugun, FIYAT_GUN],
    );
    const seriler = new Map<string, typeof satirlar>();
    for (const r of satirlar) {
      const k = `${r.yer}|${r.urun}`;
      seriler.set(k, [...(seriler.get(k) ?? []), r]);
    }
    const iller = new Set(
      siteler
        .filter(({ s }) => s.cropId === cropId)
        .map(({ s }) => s.province?.toLocaleLowerCase('tr')),
    );
    const adaylar = [...seriler.values()]
      .map((seri) => ({ seri, h: haftalikFiyat(seri) }))
      .filter((x) => x.h)
      .sort(
        (a, b) =>
          Number(iller.has(b.seri[0]!.il?.toLocaleLowerCase('tr'))) -
            Number(iller.has(a.seri[0]!.il?.toLocaleLowerCase('tr'))) ||
          b.seri.length - a.seri.length,
      );
    const en = adaylar[0];
    if (!en?.h) continue;
    const son = en.seri.find((r) => r.date === en.h!.sonTarih)!;
    fiyatlar.push({
      cropId,
      urun: son.cropName,
      yer: son.yer,
      ...en.h,
      kaynak: son.kaynak,
      kaynakUrl: son.url,
    });
  }

  return {
    ...bos,
    destekler: destekListesi,
    tarihler,
    uyarilar,
    fiyatlar,
    not: urunler.length ? null : 'Fiyat ve takvim için arazinize ürün seçin.',
  };
}

/** Bildirim metni: "2 açık başvuru, 1 yaklaşan tarih, geçen hafta 3 uyarı, buğday %4,2 arttı". */
export function ozetSatiri(o: HaftalikOzet): string | null {
  const p: string[] = [];
  if (o.destekler.length) p.push(`${o.destekler.length} açık başvuru`);
  if (o.tarihler.length) p.push(`${o.tarihler.length} yaklaşan tarih`);
  if (o.uyarilar.length) {
    const turler = [...new Set(o.uyarilar.map((u) => UYARI_ADI[u.tur]))].join(', ');
    p.push(`geçen hafta ${o.uyarilar.length} uyarı (${turler})`);
  }
  for (const f of o.fiyatlar.slice(0, 2)) {
    const yuzde = Math.abs(f.degisimPct).toLocaleString('tr-TR');
    p.push(
      f.degisimPct === 0
        ? `${f.urun.toLocaleLowerCase('tr')} fiyatı değişmedi`
        : `${f.urun.toLocaleLowerCase('tr')} %${yuzde} ${f.degisimPct > 0 ? 'arttı' : 'düştü'}`,
    );
  }
  return p.length ? p.join(', ') : null;
}

/** Kullanıcının son 7 günlük uyarı anahtarları (gönderim kaydı yalnız sistem bağlamında okunur). */
export function sonUyariAnahtarlari(q: Queryable, userId: string, now: Date): Promise<string[]> {
  return q
    .query<{ k: string }>(
      `SELECT dedupe_key AS k FROM notification_log
       WHERE user_id = $1 AND sent_at >= $2::timestamptz - interval '7 days'`,
      [userId, now],
    )
    .then((r) => r.map((x) => x.k));
}

@Controller('me')
export class HaftalikController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(PLACES) private readonly places: Places,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get('haftalik-ozet')
  async ozet(@Me() me: Principal) {
    const now = this.now();
    // Yalnız oturumdaki kullanıcının kendi kaydı okunur.
    const anahtarlar = await this.data.system((q) => sonUyariAnahtarlari(q, me.userId, now));
    return this.data.run(me, 'me.haftalik', (q) =>
      haftalikOzet(q, me.userId, now, this.places, anahtarlar),
    );
  }
}
