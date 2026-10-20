import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { containsDose } from '@tarim/agro-core';
import { expertAnswerSchema, pusulaAskSchema } from '@tarim/schemas';
import { Me, parse, RequireMfa, Roles } from '../auth/access';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { PusulaService } from './pusula.service';

@Controller('pusula')
export class PusulaController {
  constructor(
    @Inject(PusulaService) private readonly pusula: PusulaService,
    @Inject(DataService) private readonly data: DataService,
  ) {}

  /** Giriş yapmış herkes sorar. Cevap her zaman kısa karttır (başlık, 1-3 adım, kaynak, Neden?). */
  @Post('ask')
  @HttpCode(200)
  ask(@Me() me: Principal, @Body() body: unknown) {
    return this.pusula.ask(me, parse(pusulaAskSchema, body));
  }

  /** Kullanıcının uzmana sorduğu sorular ve (varsa) cevapları. */
  @Get('my')
  my(@Me() me: Principal) {
    return this.data.run(me, 'pusula.my', (q) =>
      q.query(
        `SELECT id, question, status, answer, answer_source AS "answerSource",
           answered_at AS "answeredAt", created_at AS "createdAt"
         FROM expert_questions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [me.userId],
      ),
    );
  }

  @Get('queue')
  @RequireMfa()
  @Roles('expert', 'admin')
  queue(@Me() me: Principal) {
    return this.data.run(me, 'pusula.queue', (q) =>
      q.query(
        `SELECT id, question, reason, has_image AS "hasImage", created_at AS "createdAt"
         FROM expert_questions WHERE status = 'bekliyor' ORDER BY created_at LIMIT 200`,
      ),
    );
  }

  @Get('queue/:id/image')
  @RequireMfa()
  @Roles('expert', 'admin')
  image(@Me() me: Principal, @Param('id') id: string) {
    return this.data.runOne(me, 'pusula.image', id, async (q) => {
      const [r] = await q.query<{ mime: string; base64: string }>(
        `SELECT mime, translate(encode(data, 'base64'), chr(10), '') AS base64 FROM expert_question_images WHERE question_id = $1`,
        [id],
      );
      return r;
    });
  }

  @Post('queue/:id/answer')
  @HttpCode(200)
  @RequireMfa()
  @Roles('expert', 'admin')
  async answer(@Me() me: Principal, @Param('id') id: string, @Body() body: unknown) {
    const a = parse(expertAnswerSchema, body);
    // Platform kuralı: doz/karışım oranı hiçbir yoldan (uzman cevabı dahil) kartlara girmez.
    if (containsDose(a.answer)) {
      throw new BadRequestException(
        'Cevapta ilaç miktarı ya da karışım oranı olamaz; ilacın etiketine ve BKÜ kaydına yönlendirin',
      );
    }
    await this.data.runOne(me, 'pusula.answer', id, async (q) => {
      const rows = await q.query(
        `UPDATE expert_questions
         SET status = 'cevaplandi', answer = $2, answer_source = $3, cacheable = $4,
             answered_by = $5, answered_at = now()
         WHERE id = $1 AND status = 'bekliyor' RETURNING id`,
        [id, a.answer, a.source, a.cacheable, me.userId],
      );
      return rows.length ? true : undefined;
    });
    return { id, status: 'cevaplandi' };
  }
}
