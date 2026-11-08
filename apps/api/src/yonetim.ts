import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Public } from './auth/access';
import { DataService } from './data.service';
import { WEATHER } from './weather/tokens';
import type { WeatherProvider } from './weather/openmeteo';

/**
 * Yönetim paneli (salt-okunur). Giriş: ADMIN_USER / ADMIN_PASSWORD (ortam değişkeni; varsayılan admin / 12345-6).
 * Sunucuda doğrulanır, imzalı 8 saatlik jeton verilir (x-yonetim başlığı); başarısız girişler IP başına
 * sınırlanır. Telefon numaraları KVKK gereği maskelenir (+90 532 *** ** 99). Hiçbir veri değiştirilemez.
 */
const TTL_MS = 8 * 3_600_000;
const SIR = process.env['YONETIM_SIR'] || randomBytes(32).toString('hex');
const basarisiz = new Map<string, number[]>();

const esit = (a: string, b: string): boolean => {
  const x = createHmac('sha256', 'k').update(a).digest();
  const y = createHmac('sha256', 'k').update(b).digest();
  return timingSafeEqual(x, y);
};
const imza = (s: string) => createHmac('sha256', SIR).update(s).digest('base64url');

export function jetonUret(kullanici: string, simdi = Date.now()): string {
  const yuk = Buffer.from(JSON.stringify({ k: kullanici, e: simdi + TTL_MS })).toString(
    'base64url',
  );
  return `${yuk}.${imza(yuk)}`;
}
export function jetonGecerli(j: string | undefined, simdi = Date.now()): boolean {
  if (!j) return false;
  const [yuk, im] = j.split('.');
  if (!yuk || !im || !esit(imza(yuk), im)) return false;
  try {
    return (JSON.parse(Buffer.from(yuk, 'base64url').toString()) as { e: number }).e > simdi;
  } catch {
    return false;
  }
}
/** +905321234567 → +90 532 *** ** 67 */
export const maskele = (tel: string | null | undefined): string =>
  tel && /^\+90\d{10}$/.test(tel)
    ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} *** ** ${tel.slice(-2)}`
    : '—';

async function guvenli<T>(fn: () => Promise<T>, bos: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn('yönetim sorgusu', (e as Error).message);
    return bos;
  }
}

@Controller('yonetim')
@Public()
export class YonetimController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
  ) {}

  private kontrol(req: { headers: Record<string, string | string[] | undefined> }): void {
    const j = req.headers['x-yonetim'];
    if (!jetonGecerli(Array.isArray(j) ? j[0] : j))
      throw new UnauthorizedException('Oturum geçersiz');
  }

  @Post('giris')
  @HttpCode(200)
  giris(
    @Body() b: { kullanici?: unknown; sifre?: unknown },
    @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> },
  ) {
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '?')
      .split(',')[0]!
      .trim();
    const simdi = Date.now();
    const son = (basarisiz.get(ip) ?? []).filter((t) => simdi - t < 15 * 60_000);
    if (son.length >= 8)
      throw new BadRequestException('Çok fazla deneme. 15 dakika sonra tekrar deneyin.');
    const u = process.env['ADMIN_USER'] || 'admin';
    const p = process.env['ADMIN_PASSWORD'] || '12345-6';
    const ok =
      typeof b?.kullanici === 'string' &&
      typeof b?.sifre === 'string' &&
      esit(b.kullanici, u) &&
      esit(b.sifre, p);
    if (!ok) {
      basarisiz.set(ip, [...son, simdi]);
      throw new UnauthorizedException('Kullanıcı adı ya da şifre hatalı');
    }
    basarisiz.delete(ip);
    return { jeton: jetonUret(u), kullanici: u, sureSaat: TTL_MS / 3_600_000 };
  }

  @Get('ozet')
  async ozet(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    this.kontrol(req);
    const say = (sql: string) =>
      guvenli(
        async () => Number((await this.data.system((q) => q.query<{ n: string }>(sql)))[0]?.n ?? 0),
        0,
      );
    const liste = <T>(sql: string) =>
      guvenli(() => this.data.system((q) => q.query<T>(sql)), [] as T[]);
    const [
      kullanici,
      arazi,
      haberToplam,
      haberOto,
      haberOnayli,
      soru,
      soruBekleyen,
      soruYz,
      soruUzman,
      cihaz,
      push,
      bildirim24,
      kaynakToplam,
      kaynakVeren,
      fiyat,
    ] = await Promise.all([
      say('SELECT count(*) AS n FROM users'),
      say('SELECT count(*) AS n FROM fields'),
      say('SELECT count(*) AS n FROM announcements'),
      say('SELECT count(*) AS n FROM announcements WHERE auto'),
      say("SELECT count(*) AS n FROM announcements WHERE review_status = 'uzman-onayli'"),
      say('SELECT count(*) AS n FROM expert_questions'),
      say("SELECT count(*) AS n FROM expert_questions WHERE status = 'bekliyor'"),
      say('SELECT count(*) AS n FROM expert_questions WHERE ai_answer IS NOT NULL'),
      say("SELECT count(*) AS n FROM expert_questions WHERE status = 'cevaplandi'"),
      say('SELECT count(*) AS n FROM devices'),
      say('SELECT count(*) AS n FROM push_tokens'),
      say("SELECT count(*) AS n FROM notification_log WHERE sent_at > now() - interval '24 hours'"),
      say('SELECT count(*) AS n FROM official_sources WHERE active'),
      say('SELECT count(*) AS n FROM official_sources WHERE active AND last_new_count > 0'),
      say('SELECT count(*) AS n FROM market_prices'),
    ]);
    const [gunluk, ilArazi, urun, haberIl, durumlar] = await Promise.all([
      liste<{ gun: string; kullanici: number; arazi: number; soru: number; haber: number }>(`
        SELECT to_char(d, 'YYYY-MM-DD') AS gun,
          (SELECT count(*)::int FROM users WHERE created_at::date = d) AS kullanici,
          (SELECT count(*)::int FROM fields WHERE created_at::date = d) AS arazi,
          (SELECT count(*)::int FROM expert_questions WHERE created_at::date = d) AS soru,
          (SELECT count(*)::int FROM announcements WHERE created_at::date = d) AS haber
        FROM generate_series(current_date - 13, current_date, interval '1 day') d ORDER BY d`),
      liste<{ il: string; sayi: number }>(
        `SELECT coalesce(province, 'Bilinmiyor') AS il, count(*)::int AS sayi FROM fields GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      ),
      liste<{ urun: string; sayi: number }>(
        `SELECT coalesce(c.name_tr, f.crop_id, 'Seçilmemiş') AS urun, count(*)::int AS sayi
         FROM fields f LEFT JOIN crops c ON c.id = f.crop_id GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      ),
      liste<{ il: string; sayi: number }>(
        `SELECT coalesce(s.province, 'Genel') AS il, count(*)::int AS sayi
         FROM announcements a LEFT JOIN official_sources s ON s.id = a.source_site_id
         WHERE a.auto GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      ),
      liste<{ durum: string; sayi: number }>(
        `SELECT coalesce(status, '—') AS durum, count(*)::int AS sayi FROM expert_questions GROUP BY 1`,
      ),
    ]);
    return {
      sayac: {
        kullanici,
        arazi,
        haberToplam,
        haberOto,
        haberOnayli,
        soru,
        soruBekleyen,
        soruYz,
        soruUzman,
        cihaz,
        push,
        bildirim24,
        kaynakToplam,
        kaynakVeren,
        fiyat,
      },
      gunluk,
      ilArazi,
      urun,
      haberIl,
      durumlar,
      zaman: new Date().toISOString(),
    };
  }

  @Get('nuvia')
  async nuvia(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    this.kontrol(req);
    const url = process.env['NUVIA_ADRES'] || process.env['NUVIA_URL'];
    const key = process.env['NUVIA_PROJE_ANAHTARI'];
    if (!url || !key || process.env['NUVIA_SAHTE'] === '1') return { bagli: false };
    try {
      const r = await fetch(`${url.replace(/\/$/, '')}/v1/proje/durum`, {
        headers: { 'x-nuvia-proje': key.includes('.') ? key : `tarim_pusula.${key}` },
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json()) as Record<string, unknown>;
      return {
        bagli: r.ok,
        istekBuAy: j['istek_bu_ay'] ?? null,
        buAyUsd: j['bu_ay_usd'] ?? null,
        sinirUsd: j['sinir_usd'] ?? null,
        islevler: Object.keys((j['islevler'] as object) ?? {}),
      };
    } catch {
      return { bagli: false };
    }
  }

  @Get('hava')
  async hava(@Req() req: { headers: Record<string, string | string[] | undefined> }) {
    this.kontrol(req);
    const iller = await guvenli(
      () =>
        this.data.system((q) =>
          q.query<{ il: string; lat: number; lon: number; arazi: number }>(
            `SELECT province AS il, avg(lat) AS lat, avg(lon) AS lon, count(*)::int AS arazi
             FROM fields WHERE province IS NOT NULL AND lat IS NOT NULL GROUP BY province ORDER BY 4 DESC LIMIT 15`,
          ),
        ),
      [],
    );
    const sonuc = await Promise.all(
      iller.map(async (i) => {
        try {
          const b = await Promise.race([
            this.weather.get(Number(i.lat), Number(i.lon)),
            new Promise<never>((_, red) => setTimeout(() => red(new Error('zaman aşımı')), 9000)),
          ]);
          const gunler = b.days.slice(0, 5).map((d) => ({
            tarih: d.date,
            enDusuk: d.tMinC,
            enYuksek: d.tMaxC,
            yagis: d.precipMm,
          }));
          const don = gunler.find((g) => g.enDusuk !== null && g.enDusuk <= 0);
          return {
            il: i.il,
            arazi: Number(i.arazi),
            simdi: b.current?.tempC ?? null,
            kod: b.current?.weatherCode ?? null,
            gunler,
            donGunu: don?.tarih ?? null,
            kaynak: b.source,
            ornek: b.sample === true,
          };
        } catch {
          return { il: i.il, arazi: Number(i.arazi), hata: true };
        }
      }),
    );
    return { iller: sonuc };
  }

  @Get('liste/:bolum')
  async liste(
    @Param('bolum') bolum: string,
    @Req() req: { headers: Record<string, string | string[] | undefined> },
  ) {
    this.kontrol(req);
    const q = (sql: string) =>
      guvenli(() => this.data.system((x) => x.query<Record<string, unknown>>(sql)), []);
    switch (bolum) {
      case 'kullanicilar': {
        const r = await q(`
          SELECT u.id, u.phone, u.display_name AS ad, u.created_at AS kayit,
            (SELECT string_agg(role::text, ', ') FROM user_roles r WHERE r.user_id = u.id) AS roller,
            (SELECT count(*)::int FROM fields f WHERE f.owner_id = u.id) AS arazi,
            (SELECT count(*)::int FROM expert_questions e WHERE e.user_id = u.id) AS soru,
            (SELECT max(created_at) FROM sessions s WHERE s.user_id = u.id) AS son_giris
          FROM users u ORDER BY u.created_at DESC LIMIT 500`);
        return r.map((x) => ({
          ...x,
          id: String(x['id']).slice(0, 8),
          phone: undefined,
          telefon: maskele(x['phone'] as string),
        }));
      }
      case 'araziler': {
        const r = await q(`
          SELECT f.id, f.name AS ad, f.province AS il, f.district AS ilce, f.village AS koy, f.lat, f.lon,
            f.area_decare AS dekar, coalesce(c.name_tr, f.crop_id) AS urun, f.created_at AS kayit, u.phone
          FROM fields f LEFT JOIN users u ON u.id = f.owner_id LEFT JOIN crops c ON c.id = f.crop_id
          ORDER BY f.created_at DESC LIMIT 800`);
        return r.map((x) => ({
          ...x,
          id: String(x['id']).slice(0, 8),
          phone: undefined,
          sahip: maskele(x['phone'] as string),
        }));
      }
      case 'haberler':
        return q(`
          SELECT a.id, a.source_org AS kaynak, a.title AS baslik, left(a.body, 400) AS ozet, a.category AS kategori,
            a.auto AS otomatik, a.review_status AS onay, a.published_at AS yayin, a.source_url AS adres,
            a.image_url IS NOT NULL OR a.image_data_url IS NOT NULL AS gorsel, a.targeting AS hedef, s.province AS il
          FROM announcements a LEFT JOIN official_sources s ON s.id = a.source_site_id
          ORDER BY a.created_at DESC LIMIT 500`);
      case 'kaynaklar':
        return q(`
          SELECT name AS ad, kind AS tur, province AS il, url AS adres, active AS aktif,
            last_checked_at AS son_kontrol, last_status AS durum, last_new_count AS yeni
          FROM official_sources ORDER BY kind, province NULLS FIRST, name`);
      case 'sorular': {
        const r = await q(`
          SELECT e.id, e.question AS soru, e.reason AS neden, e.status AS durum, e.has_image AS foto,
            e.province AS il, e.district AS ilce, e.answer AS uzman_cevap, e.answer_source AS uzman_kaynak,
            e.answered_at AS uzman_zaman, e.ai_answer AS ai_cevap, e.ai_source AS ai_kaynak,
            e.ai_answered_at AS ai_zaman, e.created_at AS zaman, u.phone
          FROM expert_questions e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.created_at DESC LIMIT 500`);
        return r.map((x) => ({
          ...x,
          id: String(x['id']).slice(0, 8),
          phone: undefined,
          kullanici: maskele(x['phone'] as string),
        }));
      }
      case 'bildirimler': {
        const r = await q(`
          SELECT * FROM (
            SELECT 'gönderim' AS tur, n.kind::text AS tip, n.dedupe_key AS baslik, n.sent_at AS zaman, u.phone
              FROM notification_log n LEFT JOIN users u ON u.id = n.user_id
            UNION ALL
            SELECT 'kutu', b.kind::text, b.title, b.created_at, u.phone
              FROM notifications b LEFT JOIN users u ON u.id = b.user_id
          ) t ORDER BY zaman DESC LIMIT 400`);
        return r.map((x) => ({ ...x, phone: undefined, kullanici: maskele(x['phone'] as string) }));
      }
      case 'cihazlar': {
        const r = await q(`
          SELECT d.name AS ad, d.kind AS tur, f.name AS arazi, f.province AS il, d.created_at AS kayit,
            (SELECT count(*)::int FROM irrigation_commands c WHERE c.device_id = d.id) AS komut
          FROM devices d LEFT JOIN fields f ON f.id = d.field_id ORDER BY d.created_at DESC LIMIT 300`);
        return r;
      }
      case 'fiyatlar':
        return q(`
          SELECT p.product_name AS urun, pl.name AS yer, p.price_min AS en_dusuk, p.price_max AS en_yuksek,
            p.price_date AS tarih, p.source_id AS kaynak
          FROM market_prices p LEFT JOIN market_places pl ON pl.id = p.place_id
          ORDER BY p.price_date DESC, p.id DESC LIMIT 300`);
      case 'denetim': {
        const r = await q(`
          SELECT seq, at AS zaman, action AS islem, entity AS varlik, left(coalesce(entity_id, ''), 8) AS kimlik
          FROM audit_log ORDER BY seq DESC LIMIT 300`);
        return r;
      }
      default:
        throw new BadRequestException('Bilinmeyen bölüm');
    }
  }
}
