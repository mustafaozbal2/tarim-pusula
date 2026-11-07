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
