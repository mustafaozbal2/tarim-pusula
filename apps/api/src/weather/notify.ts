import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  gruplaSatir,
  paketle,
  processNotification,
  TR_UTC_OFFSET_HOURS,
  type NotificationQueue,
  type ProcessorDeps,
  type PushClient,
  type Uyari,
} from '@tarim/workers';
import { pickPack, stagesOf } from '../controllers.g2';
import { DataService } from '../data.service';
import type { Queryable } from '../db/db';
import { frostCard, type FrostCard } from './today';
import type { WeatherProvider } from './openmeteo';
import { CLOCK, NOTIFY_QUEUE, PUSH, WEATHER, WHATSAPP } from './tokens';
import { Optional } from '@nestjs/common';
import { SMS } from '../auth/auth.service';
import type { SmsProvider } from '../auth/sms';
import { donBildirimi, geceDonu, tehlikeler } from './gece';
import { yerelSimdi } from './today';
import { PLACES } from '../controllers.g2';
import { haftalikOzet, ozetSatiri, sonUyariAnahtarlari } from '../haftalik';
import type { Places } from '../places';
import { haftaAnahtari } from '@tarim/agro-core';

export interface ScanResult {
  checked: number;
  queued: number;
  failed: number;
}

/** Kritik uyarının SMS/WhatsApp ile gideceği kişi (tercihleri `users` tablosunda). */
interface Kisi {
  phone: string;
  sms: boolean;
  whatsapp: boolean;
}

/** Bilgi düzeyi uyarıların günlük özeti bu yerel saatten sonra gider (tarama 14:00-22:00 arası çalışır). */
export const OZET_SAATI = 18;

/** "Bu gece / bu sabah / 2 gün sonra" biçiminde çiftçi dili. */
export function frostWhen(card: Pick<FrostCard, 'dayOffset'>): string {
  const d = card.dayOffset ?? 0;
  return d === 0 ? 'bu sabah' : d === 1 ? 'bu gece' : `${d} gün sonra`;
}

@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private close: (() => Promise<void>) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(NOTIFY_QUEUE) private readonly queue: NotificationQueue,
    @Inject(PUSH) private readonly push: PushClient,
    @Optional() @Inject(SMS) private readonly sms?: SmsProvider,
    @Optional() @Inject(WHATSAPP) private readonly whatsapp?: SmsProvider | null,
    @Optional() @Inject(PLACES) private readonly places?: Places,
  ) {}

  async onModuleInit(): Promise<void> {
    this.close = await this.queue.process(async (job) => {
      await processNotification(job, this.deps());
    });
    const minutes = Number(process.env['FROST_SCAN_INTERVAL_MIN']);
    if (Number.isFinite(minutes) && minutes > 0) {
      this.timer = setInterval(() => {
        void this.scanFrost().catch(console.error);
        void this.scanHava().catch(console.error);
        void this.scanHaftalik().catch(console.error);
      }, minutes * 60_000);
      this.timer.unref?.();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.close?.();
  }

  private deps(): ProcessorDeps {
    return {
      push: this.push,
      queue: this.queue,
      now: this.now,
      tokensOf: (userId) =>
        this.data.system(async (q) =>
          (
            await q.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [
              userId,
            ])
          ).map((r) => r.token),
        ),
      // Toplu bildirimde içindeki her uyarı da gönderildi sayılır; sonraki tarama onları yeniden göndermez.
      claim: (job) =>
        this.data.system(async (q) => {
          const ilk =
            (
              await q.query(
                `INSERT INTO notification_log(dedupe_key, user_id, kind) VALUES ($1,$2,$3)
                 ON CONFLICT DO NOTHING RETURNING 1`,
                [job.dedupeKey, job.userId, job.kind],
              )
            ).length > 0;
          if (ilk) await this.isaretle(q, job.userId, job.anahtarlar ?? [], job.kind);
          return ilk;
        }),
      release: (job) =>
        this.data.system(async (q) => {
          await q.query(
            'DELETE FROM notification_log WHERE dedupe_key = ANY($1) AND user_id = $2',
            [[job.dedupeKey, ...(job.anahtarlar ?? [])], job.userId],
          );
        }),
      dropToken: (token) =>
        this.data.system(async (q) => {
          await q.query('DELETE FROM push_tokens WHERE token = $1', [token]);
        }),
    };
  }

  /** Verilen anahtarları kullanıcı için gönderildi diye yazar; yalnız yeni yazılanları döner. */
  private async isaretle(
    q: Queryable,
    userId: string,
    anahtarlar: string[],
    kind: string,
  ): Promise<Set<string>> {
    const yeni = new Set<string>();
    for (const k of anahtarlar) {
      const r = await q.query(
        `INSERT INTO notification_log(dedupe_key, user_id, kind) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING RETURNING 1`,
        [k, userId, kind],
      );
      if (r.length) yeni.add(k);
    }
    return yeni;
  }

  /** Türkiye yerel saati ve günü (özet zamanı ve özet anahtarı için). */
  private yerel(): { saat: number; gun: string } {
    const t = new Date(this.now().getTime() + TR_UTC_OFFSET_HOURS * 3_600_000).toISOString();
    return { saat: Number(t.slice(11, 13)), gun: t.slice(0, 10) };
  }

  /**
   * Taramanın uyarılarını dağıtır: daha önce gönderilmişleri ayıklar, kalanları önem sırasıyla (gerekirse
   * tek bildirimde toplanarak) kuyruğa koyar; kritik olanları ayrıca açık kanallardan (SMS, WhatsApp) yollar.
   */
  private async dagit(
    uyarilar: Uyari[],
    kisiler: Map<string, Kisi>,
  ): Promise<{ queued: number; sms: number; whatsapp: number }> {
    const gonderilmis = new Set(
      uyarilar.length
        ? (
            await this.data.system((q) =>
              q.query<{ k: string; u: string }>(
                'SELECT dedupe_key AS k, user_id AS u FROM notification_log WHERE dedupe_key = ANY($1)',
                [uyarilar.map((u) => u.dedupeKey)],
              ),
            )
          ).map((r) => `${r.u}|${r.k}`)
        : [],
    );
    const { saat, gun } = this.yerel();
    const isler = paketle(
      uyarilar.filter((u) => !gonderilmis.has(`${u.userId}|${u.dedupeKey}`)),
      { ozetZamani: saat >= OZET_SAATI, gun },
    );
    for (const j of isler) await this.queue.enqueue(j);
    return { queued: isler.length, ...(await this.kritikKanallar(uyarilar, kisiler)) };
  }

  /**
   * Kritik uyarılar SMS (KRITIK_SMS=1; eski adı DON_SMS=1) ve WhatsApp (sunucuda anahtar varsa) ile de gider,
   * çiftçi o kanalı ayarlardan kapatmadıysa. Her uyarı kanal başına bir kez; kişi başına tek mesajda toplanır.
   * Tur başına en çok DON_SMS_LIMIT mesaj (SMS/WhatsApp ücretli).
   */
  private async kritikKanallar(uyarilar: Uyari[], kisiler: Map<string, Kisi>) {
    const sayac = { sms: 0, whatsapp: 0 };
    const smsAcik = (process.env['KRITIK_SMS'] ?? process.env['DON_SMS']) === '1' && !!this.sms;
    const limit = Number(process.env['DON_SMS_LIMIT'] ?? 40);
    const kisiBasi = new Map<string, Uyari[]>();
    for (const u of uyarilar)
      if (u.oncelik === 'kritik') kisiBasi.set(u.userId, [...(kisiBasi.get(u.userId) ?? []), u]);
    for (const [userId, liste] of kisiBasi) {
      const k = kisiler.get(userId);
      if (!k) continue;
      const kanallar = [
        smsAcik && k.sms ? (['sms', this.sms!] as const) : null,
        this.whatsapp && k.whatsapp ? (['whatsapp', this.whatsapp] as const) : null,
      ];
      for (const kanal of kanallar) {
        if (!kanal || sayac.sms + sayac.whatsapp >= limit) continue;
        const [ad, saglayici] = kanal;
        const anahtar = (u: Uyari) => `${ad}:${u.dedupeKey}`;
        const yeni = await this.data.system((q) =>
          this.isaretle(q, userId, liste.map(anahtar), liste[0]!.kind),
        );
        const gidecek = liste.filter((u) => yeni.has(anahtar(u)));
        if (!gidecek.length) continue;
        try {
          await saglayici.send(
            k.phone,
            `Tarim Pusula: ${gruplaSatir(gidecek, 3).join('; ')}. Ayrinti uygulamada.`,
          );
          sayac[ad]++;
        } catch {
          await this.data.system((q) =>
            q.query('DELETE FROM notification_log WHERE dedupe_key = ANY($1) AND user_id = $2', [
              [...yeni],
              userId,
            ]),
          );
        }
      }
    }
    return sayac;
  }

  /**
   * Cihazı kayıtlı çiftçilerin ürünlü tarlalarında önümüzdeki 3 sabahın don olasılığına bakar;
   * olasılık ≥ %50 ve eşik onaylıysa kritik don uyarısı üretir (tarla + gün başına bir kez).
   */
  async scanFrost(): Promise<ScanResult> {
    const fields = await this.data.system((q) =>
      q.query<{
        id: string;
        ownerId: string;
        name: string;
        lat: number;
        lon: number;
        cropId: string;
        phone: string;
        sms: boolean;
        whatsapp: boolean;
      }>(
        `SELECT f.id, f.owner_id AS "ownerId", f.name, f.lat, f.lon, f.crop_id AS "cropId",
           u.phone, u.bildirim_sms AS sms, u.bildirim_whatsapp AS whatsapp
         FROM fields f JOIN users u ON u.id = f.owner_id
         WHERE f.lat IS NOT NULL AND f.lon IS NOT NULL AND f.crop_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.user_id = f.owner_id)
         ORDER BY f.created_at`,
      ),
    );
    const res: ScanResult = { checked: 0, queued: 0, failed: 0 };
    const uyarilar: Uyari[] = [];
    const kisiler = new Map<string, Kisi>();
    for (const f of fields) {
      res.checked++;
      kisiler.set(f.ownerId, f);
      try {
        const bundle = await this.weather.get(f.lat, f.lon);
        const { pack, stages } = await this.data.system(async (q) => {
          const p = await pickPack(q, f.cropId);
          return { pack: p, stages: p ? await stagesOf(q, p.id) : [] };
        });
        const card = frostCard({
          field: { id: f.id, name: f.name, lat: f.lat, lon: f.lon, cropId: f.cropId },
          bundle,
          pack: pack
            ? {
                reviewStatus: pack.reviewStatus,
                kcMid: Number(pack.kcMid),
                version: pack.version,
                source: pack.source,
              }
            : null,
          stages,
          now: this.now(),
        });
        const a = card.assessment;
        if (a.kind !== 'frost' || a.level !== 'warning' || !card.date) continue;
        uyarilar.push({
          oncelik: 'kritik',
          kind: 'frost',
          userId: f.ownerId,
          baslik: 'Don uyarısı',
          metin: `${f.name}: ${frostWhen(card)} don bekleniyor. Ne yapacağını görmek için uygulamayı aç.`,
          satir: `${f.name} ${frostWhen(card)}`,
          dedupeKey: `frost:${f.id}:${card.date}`,
          data: { fieldId: f.id, date: card.date },
        });
      } catch {
        res.failed++; // bir tarlanın hatası diğerlerini durdurmaz
      }
    }
    res.queued = (await this.dagit(uyarilar, kisiler)).queued;
    return res;
  }

  /**
   * Meteorolojik uyarılar (ürün eşiğinden bağımsız, olgu), önem sırasıyla:
   * kritik: bu gece hava donu (2 m sıcaklık ≤ 0 °C), yarın kuvvetli yağış (≥ YAGIS_ESIK_MM);
   * önemli: yarın kar ya da kuvvetli rüzgâr; bilgi: 2-6 gün sonrası tehlikeler (akşam günlük özete katlanır).
   * Günlük sayı sınırı yok; aynı anda birden fazlası tek bildirimde toplanır. Kritikler SMS/WhatsApp ile de gider.
   * Yalnız yerel saat 14:00-22:00 arasında gönderilir (gece yarısı uyandırılmaz).
   */
  async scanHava(): Promise<ScanResult & { sms: number; whatsapp: number }> {
    const fields = await this.data.system((q) =>
      q.query<{
        id: string;
        ownerId: string;
        name: string;
        lat: number;
        lon: number;
        phone: string;
        sms: boolean;
        whatsapp: boolean;
      }>(
        `SELECT f.id, f.owner_id AS "ownerId", f.name, f.lat, f.lon, u.phone,
           u.bildirim_sms AS sms, u.bildirim_whatsapp AS whatsapp
         FROM fields f JOIN users u ON u.id = f.owner_id
         WHERE f.lat IS NOT NULL AND f.lon IS NOT NULL ORDER BY f.created_at`,
      ),
    );
    const res = { checked: 0, failed: 0 };
    const uyarilar: Uyari[] = [];
    const kisiler = new Map<string, Kisi>();
    for (const f of fields) {
      res.checked++;
      kisiler.set(f.ownerId, f);
      try {
        const b = await this.weather.get(f.lat, f.lon);
        const yerel = yerelSimdi(this.now(), b.utcOffsetSeconds);
        const saat = Number(yerel.slice(11, 13));
        if (saat < 14 || saat >= 22) continue;
        const g = b.hourly?.length ? geceDonu(b.hourly, yerel) : null;
        if (g?.var) {
          uyarilar.push({
            oncelik: 'kritik',
            kind: 'frost',
            userId: f.ownerId,
            baslik: 'Bu gece don bekleniyor',
            metin: donBildirimi(f.name, g),
            satir: `${f.name} ${g.baslangic}-${g.bitis} ${g.enDusukC}°`,
            dedupeKey: `hava-don:${f.id}:${g.sabah}`,
            data: { fieldId: f.id, date: g.sabah },
          });
        }
        for (const t of tehlikeler(b.days, yerel.slice(0, 10))) {
          // Bu gecenin donu saatlik veriden yukarıda; günlük "yarın don" onu tekrarlar.
          if (t.gunFarki < 1 || (t.gunFarki === 1 && t.tur === 'don')) continue;
          const oncelik =
            t.gunFarki > 1
              ? 'bilgi'
              : t.tur === 'yagis'
                ? ('kritik' as const)
                : ('onemli' as const);
          uyarilar.push({
            oncelik,
            kind: 'info',
            userId: f.ownerId,
            baslik: t.baslik,
            metin: `${f.name}: ${t.baslik}.`,
            satir: f.name,
            dedupeKey: `hava-${t.tur}:${f.id}:${t.tarih}`,
            data: { fieldId: f.id, date: t.tarih },
          });
        }
      } catch {
        res.failed++;
      }
    }
    return { ...res, ...(await this.dagit(uyarilar, kisiler)) };
  }

  /**
   * Haftalık özet bildirimi: pazartesi yerel 09:00-21:00 arasında, telefonu kayıtlı her çiftçiye haftada
   * bir kez (anahtar `haftalik:<ISO hafta>`). Özette gösterecek bir şey yoksa gönderilmez.
   */
  async scanHaftalik(): Promise<{ checked: number; queued: number }> {
    const now = this.now();
    const yerel = new Date(now.getTime() + TR_UTC_OFFSET_HOURS * 3_600_000);
    const saat = yerel.getUTCHours();
    if (!this.places || yerel.getUTCDay() !== 1 || saat < 9 || saat >= 21)
      return { checked: 0, queued: 0 };
    const anahtar = `haftalik:${haftaAnahtari(yerel.toISOString().slice(0, 10))}`;
    const kisiler = await this.data.system((q) =>
      q.query<{ u: string }>(
        `SELECT DISTINCT t.user_id AS u FROM push_tokens t
         WHERE NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id = t.user_id AND n.dedupe_key = $1)`,
        [anahtar],
      ),
    );
    let queued = 0;
    for (const { u } of kisiler) {
      const satir = await this.data.system(async (q) =>
        ozetSatiri(
          await haftalikOzet(q, u, now, this.places!, await sonUyariAnahtarlari(q, u, now)),
        ),
      );
      if (!satir) continue;
      await this.queue.enqueue({
        kind: 'info',
        oncelik: 'onemli',
        userId: u,
        title: 'Haftalık özetiniz hazır',
        body: `${satir}.`,
        dedupeKey: anahtar,
        data: { kind: 'haftalik' },
      });
      queued++;
    }
    return { checked: kisiler.length, queued };
  }
}
