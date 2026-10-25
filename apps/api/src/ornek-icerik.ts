import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DATA_DIR } from './places';

/** Bir örnek kayıt: ekrandaki tarih demo gününe `gunFarki` eklenerek bulunur (kesin tarih iddiası yok). */
export interface OrnekSatir {
  baslik: string;
  ozet: string;
  gunFarki: number;
}

/** data/ornek_icerik/<urun-id>.json (scripts/gen-ornek-icerik.mjs üretir). */
export interface OrnekIcerik {
  urunId: string;
  urunAdi: string;
  kaynak: string;
  tarih: string;
  surum: string;
  kartlar: { baslik: string; ozet: string; gorsel: string }[];
  faaliyetZamani: OrnekSatir[];
  faaliyetRehberi: OrnekSatir[];
  erkenUyarilar: OrnekSatir[];
  destekler: OrnekSatir[];
}

const ID = /^[a-z0-9-]{1,64}$/;

/** Ürünün örnek içeriği; dosya yoksa (ya da kimlik geçersizse) null. */
export function readOrnekIcerik(cropId: string, dataDir = DEFAULT_DATA_DIR): OrnekIcerik | null {
  if (!ID.test(cropId)) return null;
  const file = join(dataDir, 'ornek_icerik', `${cropId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as OrnekIcerik;
}

/**
 * Ana sayfa örnek içeriği (G22). YALNIZ demo sunucusunda kayıtlıdır; gerçek modda bu uç hiç yoktur (404)
 * ve çiftçi ekranında yalnız onaylı veri/panel duyuruları görünür (değişmez kural 1).
 */
@Controller('demo')
export class OrnekIcerikController {
  @Get('ornek-icerik/:cropId')
  get(@Param('cropId') cropId: string): OrnekIcerik {
    const c = readOrnekIcerik(cropId);
    if (!c) throw new NotFoundException('Bu ürün için örnek içerik yok');
    return c;
  }
}
