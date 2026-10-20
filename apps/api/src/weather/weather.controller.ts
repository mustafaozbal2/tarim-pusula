import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { pushTokenSchema } from '@tarim/schemas';
import { Me, parse, Roles } from '../auth/access';
import { pickPack, stagesOf } from '../controllers.g2';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { NotifyService } from './notify';
import { WeatherUnavailableError, type WeatherProvider } from './openmeteo';
import { CLOCK, WEATHER } from './tokens';
import { buildToday } from './today';

/** Bugün ekranı: bir tarlanın havası, bitkinin su ihtiyacı ve don olasılığı. */
@Controller('fields')
export class TodayController {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(WEATHER) private readonly weather: WeatherProvider,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  /** `elevation`: parselin yüksekliği (m); verilmezse Open-Meteo'nun nokta yüksekliği. */
  @Get(':id/today')
  async today(
    @Me() me: Principal,
    @Param('id') id: string,
    @Query('elevation') elevation?: string,
  ) {
    let site: number | undefined;
    if (elevation !== undefined) {
      site = Number(elevation);
      if (!Number.isFinite(site) || site < -430 || site > 5000) {
        throw new BadRequestException('elevation -430 ile 5000 m arasında olmalı');
      }
    }
    // Tarla okuması RLS altında: yetkisiz kullanıcı 403 alır ve denetim satırı düşer.
    const ctx = await this.data.runOne(me, 'fields.today', id, async (q) => {
      const [f] = await q.query<{
        id: string;
        name: string;
        lat: number | null;
        lon: number | null;
        cropId: string | null;
      }>('SELECT id, name, lat, lon, crop_id AS "cropId" FROM fields WHERE id = $1', [id]);
      if (!f) return undefined;
      const pack = f.cropId ? await pickPack(q, f.cropId) : undefined;
      return { f, pack, stages: pack ? await stagesOf(q, pack.id) : [] };
    });
    const { f, pack, stages } = ctx;
    if (f.lat === null || f.lon === null) {
      throw new BadRequestException('Tarlanın konumu yok');
    }
    let bundle;
    try {
      bundle = await this.weather.get(f.lat, f.lon);
    } catch (e) {
      if (e instanceof WeatherUnavailableError) throw new ServiceUnavailableException(e.message);
      throw e;
    }
    return buildToday({
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
      siteElevationM: site,
    });
  }
}

/** Cihaz bildirim belirteci kaydı. */
@Controller('me/push-token')
export class PushTokenController {
  constructor(@Inject(DataService) private readonly data: DataService) {}

  @Post()
  @HttpCode(200)
  async register(@Me() me: Principal, @Body() body: unknown) {
    const { token, platform } = parse(pushTokenSchema, body);
    await this.data.run(me, 'push.register', (q) =>
      q.query('SELECT push_register($1, $2)', [token, platform]),
    );
    return { ok: true };
  }

  @Delete()
  @HttpCode(204)
  async remove(@Me() me: Principal, @Body() body: unknown) {
    const { token } = parse(pushTokenSchema.pick({ token: true }), body);
    await this.data.run(me, 'push.remove', (q) =>
      q.query('DELETE FROM push_tokens WHERE token = $1', [token]),
    );
  }
}

@Controller('admin/jobs')
@Roles('admin')
export class JobsController {
  constructor(@Inject(NotifyService) private readonly notify: NotifyService) {}

  /** Don taramasını elle başlatır (zamanlayıcı FROST_SCAN_INTERVAL_MIN ile de çalışır). */
  @Post('frost-scan')
  @HttpCode(200)
  frostScan() {
    return this.notify.scanFrost();
  }
}
