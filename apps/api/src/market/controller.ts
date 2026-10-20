import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { Me, Roles } from '../auth/access';
import type { Principal } from '../db/db';
import { MarketCollector } from './collector';
import { MarketService } from './service';

const num = (name: string, v: string | undefined): number | null => {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequestException(`${name} sayı olmalı`);
  return n;
};

/** Pazar: fiyat, trend, nerede satarım, net kazanç aralığı. Her fiyat kaynak + tarih + sürüm taşır. */
@Controller('market')
export class MarketController {
  constructor(@Inject(MarketService) private readonly market: MarketService) {}

  @Get('crops')
  crops(@Me() me: Principal) {
    return this.market.crops(me);
  }

  @Get('prices')
  prices(
    @Me() me: Principal,
    @Query('crop') crop?: string,
    @Query('fieldId') fieldId?: string,
    @Query('transport') transport?: string,
    @Query('commission') commission?: string,
  ) {
    if (!crop || !/^[a-z0-9-]+$/.test(crop)) throw new BadRequestException('crop gerekli');
    return this.market.overview(me, crop, {
      fieldId,
      transportTlPerTonKm: num('transport', transport),
      commissionRate: num('commission', commission),
    });
  }
}

@Controller('admin/jobs')
@Roles('admin')
export class MarketJobsController {
  constructor(@Inject(MarketCollector) private readonly collector: MarketCollector) {}

  /** Toplayıcıları elle çalıştırır (tekrar çekim aralığı ve robots.txt kuralları yine geçerlidir). */
  @Post('market-collect')
  @HttpCode(200)
  collect() {
    return this.collector.runAll();
  }
}
