import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { looksLikeInjection } from '@tarim/agro-core';
import { z } from 'zod';
import { Me, parse } from '../auth/access';
import type { Principal } from '../db/db';
import { NUVIA } from './bekleme';
import type { NuviaClient } from './client';

const sohbetSema = z.object({
  soru: z.string().trim().min(2).max(600),
  urun: z.string().trim().max(80).nullish(),
  il: z.string().trim().max(80).nullish(),
  gecmis: z.array(z.string().trim().max(300)).max(6).optional(),
});
const sesSema = z.object({ metin: z.string().trim().min(2).max(700) });
const fotoSema = z.object({
  soru: z.string().trim().max(600).nullish(),
  urun: z.string().trim().max(80).nullish(),
  il: z.string().trim().max(80).nullish(),
  gorsel: z.object({
    mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    // ~900 KB görsel (base64 ~1,2 MB) üstü kabul edilmez; telefon küçültüp gönderir.
    base64: z
      .string()
      .min(100)
      .max(1_300_000)
      .regex(/^[A-Za-z0-9+/=]+$/),
  }),
});

/** Basit kullanıcı başına dakikalık sınır (bellek içi; Nuvia kotası boşa gitmesin). */
const kova = new Map<string, number[]>();
export function sinirli(anahtar: string, en: number, simdi = Date.now()): boolean {
  const a = (kova.get(anahtar) ?? []).filter((t) => simdi - t < 60_000);
  if (a.length >= en) {
    kova.set(anahtar, a);
    return true;
  }
  a.push(simdi);
  kova.set(anahtar, a);
  return false;
}

export const ROBOT_YEDEK =
  'Şu an bunu cevaplayamıyorum. Hava, takvim ve sulama için sayfalara bakabilir, sorunu Uzmana sor bölümünden yazabilirsin.';

/**
 * Robot asistan: yerel komut çözücünün anlamadığı serbest sohbet Nuvia'ya gider (robot_sohbet), cevap sesli okunur.
 * Nuvia kapalı/yavaşsa 200 + yedek cümle döner (çiftçi hata görmez). Doz içeren cevap istemcide atılır (kural 2).
 */
@Controller('robot')
export class RobotController {
  constructor(@Inject(NUVIA) private readonly nuvia: NuviaClient) {}

  @Post('sohbet')
  @HttpCode(200)
  async sohbet(@Me() me: Principal, @Body() body: unknown) {
    const g = parse(sohbetSema, body);
    if (sinirli(`s:${me.userId}`, 20))
      return {
        cevap: 'Biraz yavaş gidelim; bir dakika sonra yine sor.',
        yonlendir: null,
        kaynak: 'sinir',
      };
    if (looksLikeInjection(g.soru) || !this.nuvia.robotSohbet)
      return { cevap: ROBOT_YEDEK, yonlendir: null, kaynak: 'yedek' };
    const r = await this.nuvia.robotSohbet({
      soru: g.soru,
      urun: g.urun ?? null,
      il: g.il ?? null,
      gecmis: g.gecmis ?? [],
    });
    return r ? { ...r, kaynak: 'nuvia' } : { cevap: ROBOT_YEDEK, yonlendir: null, kaynak: 'yedek' };
  }

  /**
   * Yapay zekâ sayfası: fotoğraflı soru. Nuvia görüntüyü inceler (foto_analiz); cevap kesin teşhis değildir,
   * doz içermez (içerirse atılır) ve sonuna yapay zekâ uyarısı eklenir. Nuvia yoksa yedek cümle döner.
   */
  @Post('foto')
  @HttpCode(200)
  async foto(@Me() me: Principal, @Body() body: unknown) {
    const g = parse(fotoSema, body);
    if (sinirli(`f:${me.userId}`, 6))
      return { cevap: 'Biraz yavaş gidelim; bir dakika sonra yine gönder.', kaynak: 'sinir' };
    const soru = g.soru?.trim() || 'Bu fotoğraftaki bitkide ne görüyorsun? Olası nedenleri sırala.';
    if (looksLikeInjection(soru)) return { cevap: ROBOT_YEDEK, kaynak: 'yedek' };
    const r = await this.nuvia.soruCevapla({
      soru,
      urun: g.urun ?? null,
      il: g.il ?? null,
      gorsel: g.gorsel,
    });
    return r
      ? { cevap: r.metin, kaynak: r.kaynak }
      : {
          cevap:
            'Fotoğrafı şu an inceleyemedim. Uzmana sor bölümünden fotoğraflı soru gönderebilirsin; uzman cevaplar.',
          kaynak: 'yedek',
        };
  }

  /** Kadın sesi (WAV). `ses: null` ise telefon kendi sesini kullanır. */
  @Post('ses')
  @HttpCode(200)
  async ses(@Me() me: Principal, @Body() body: unknown) {
    const g = parse(sesSema, body);
    if (sinirli(`v:${me.userId}`, 12) || !this.nuvia.ses) return { ses: null };
    const r = await this.nuvia.ses(g.metin);
    return { ses: r };
  }
}
