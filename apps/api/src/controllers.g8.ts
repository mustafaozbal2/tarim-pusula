import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { commandCreateSchema } from '@tarim/schemas';
import { Me, parse, Roles } from './auth/access';
import type { Principal } from './db/db';
import { IrrigationService } from './irrigation';

/** Sulama: komut, durum, geçmiş. Yetki kararı veritabanındadır (RLS); burada yalnız yönlendirme var. */
@Controller()
export class IrrigationController {
  constructor(@Inject(IrrigationService) private readonly irr: IrrigationService) {}

  /** Cihaz kimliğini (yeniden) üretir; sır yalnız bu yanıtta döner. */
  @Post('devices/:id/provision')
  provision(@Me() me: Principal, @Param('id') id: string) {
    return this.irr.provision(me, id);
  }

  @Post('devices/:id/commands')
  @HttpCode(202)
  command(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.irr.command(me, id, parse(commandCreateSchema, body));
  }

  @Get('devices/:id/status')
  status(@Me() me: Principal, @Param('id') id: string) {
    return this.irr.status(me, id);
  }

  @Get('commands/:id')
  get(@Me() me: Principal, @Param('id') id: string) {
    return this.irr.getCommand(me, id);
  }

  @Get('admin/irrigation/latency')
  @Roles('admin')
  latency() {
    return this.irr.latency();
  }
}
