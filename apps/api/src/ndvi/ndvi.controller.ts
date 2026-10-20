import { Controller, Get, Inject, Param, ServiceUnavailableException } from '@nestjs/common';
import { assessNdviTrend, reliablePoints, type NdviPoint, type NdviTrend } from '@tarim/agro-core';
import type { Boundary } from '@tarim/schemas';
import { Me } from '../auth/access';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { CLOCK } from '../weather/tokens';
import { NdviUnavailableError, type NdviProvider } from './provider';
import { NDVI } from './tokens';

/** Gösterilen pencere: son 150 gün (≈ 21 haftalık aralık). */
export const NDVI_WINDOW_DAYS = 150;
const TTL_MS = 12 * 3_600_000;
const DAY = 86_400_000;

export type NdviDto =
  | {
      kind: 'series';
      fieldId: string;
      fieldName: string;
      /** Yalnız yeterince bulutsuz aralıklar. */
      points: Pick<NdviPoint, 'from' | 'to' | 'mean' | 'validFraction'>[];
      /** Bulut nedeniyle gösterilmeyen aralık sayısı. */
      skipped: number;
      trend: NdviTrend;
      source: { name: string; version: string; date: string };
      fetchedAt: string;
      /** Uydu sunucusuna ulaşılamadı, önbellekteki son seri döndü. */
      stale: boolean;
      /** Üretilmiş örnek veri (anahtar yok); gerçek uydu verisi değil. */
      sample: boolean;
      /** Düşüş kuralı uzman onaylı değil: arayüz rozet gösterir, uyarı/komut üretmez. */
      needsBadge: true;
    }
  | { kind: 'none'; reason: 'sinir-yok' | 'veri-yok'; fieldId: string };

interface CacheEntry {
  at: number;
  key: string;
  dto: Extract<NdviDto, { kind: 'series' }>;
}

/** Tarla bazlı NDVI zaman serisi (Sentinel-2). */
@Controller('fields')
export class NdviController {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(NDVI) private readonly provider: NdviProvider,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  @Get(':id/ndvi')
  async ndvi(@Me() me: Principal, @Param('id') id: string): Promise<NdviDto> {
    // Okuma RLS altında: yetkisiz kullanıcı 403 alır ve denetim satırı düşer.
    const f = await this.data.runOne(me, 'fields.ndvi', id, async (q) => {
      const [row] = await q.query<{ id: string; name: string; boundary: Boundary | null }>(
        'SELECT id, name, boundary FROM fields WHERE id = $1',
        [id],
      );
      return row;
    });
    // Sınır yoksa nokta konumdan uydurma kare üretilmez: parsel sağlığı sınır ister.
    if (!f.boundary) return { kind: 'none', reason: 'sinir-yok', fieldId: f.id };

    const now = this.now();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - NDVI_WINDOW_DAYS * DAY).toISOString().slice(0, 10);
    const key = `${JSON.stringify(f.boundary)}|${to}`;
    const hit = this.cache.get(f.id);
    if (hit && hit.key === key && now.getTime() - hit.at < TTL_MS) return hit.dto;

    let result;
    try {
      result = await this.provider.series(f.boundary, from, to);
    } catch (e) {
      if (!(e instanceof NdviUnavailableError)) throw e;
      // Önbellekteki eski seri (aynı sınır) "eski" işaretiyle verilir; yoksa 503.
      if (hit && hit.key.startsWith(`${JSON.stringify(f.boundary)}|`)) {
        return { ...hit.dto, stale: true };
      }
      throw new ServiceUnavailableException(e.message);
    }
    if (result.points.length === 0) return { kind: 'none', reason: 'veri-yok', fieldId: f.id };

    const ok = reliablePoints(result.points);
    const dto: Extract<NdviDto, { kind: 'series' }> = {
      kind: 'series',
      fieldId: f.id,
      fieldName: f.name,
      points: ok.map((p) => ({
        from: p.from,
        to: p.to,
        mean: p.mean,
        validFraction: p.validFraction,
      })),
      skipped: result.points.length - ok.length,
      trend: assessNdviTrend(result.points),
      source: { name: result.source, version: result.version, date: to },
      fetchedAt: now.toISOString(),
      stale: false,
      sample: result.sample,
      needsBadge: true,
    };
    this.cache.set(f.id, { at: now.getTime(), key, dto });
    return dto;
  }
}
