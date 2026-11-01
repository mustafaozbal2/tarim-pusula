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
import { systemTx, type Db, type Principal } from '../db/db';
import type { PushClient } from '@tarim/workers';
import { DB } from '../auth/auth.service';
import { PUSH } from '../weather/tokens';
import { notifyUser } from '../yetki/notify';
import { PusulaService } from './pusula.service';

@Controller('pusula')
export class PusulaController {
  constructor(
    @Inject(PusulaService) private readonly pusula: PusulaService,
    @Inject(DataService) private readonly data: DataService,
    @Inject(DB) private readonly db: Db,
    @Inject(PUSH) private readonly push: PushClient,
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
           answered_at AS "answeredAt", created_at AS "createdAt", has_image AS "hasImage",
           (assigned_to IS NOT NULL) AS assigned
         FROM expert_questions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [me.userId],
      ),
    );
  }

  /**
   * Uzmanın soru kuyruğu (G24): ona atanmış sorular önce, sonra kimseye atanamamış olanlar. Yönetici
   * hepsini görür. Çiftçinin telefonu/adı gösterilmez; yalnız il, ilçe ve ürün (KVKK).
   */
  @Get('queue')
  @RequireMfa()
  @Roles('expert', 'admin')
  queue(@Me() me: Principal) {
    const all = me.roles.includes('admin');
    return this.data.run(me, 'pusula.queue', (q) =>
      q.query(
        `SELECT e.id, e.question, e.reason, e.has_image AS "hasImage", e.created_at AS "createdAt",
           e.province, e.district, e.crop_id AS "cropId", c.name_tr AS "cropName",
           (e.assigned_to = $1) AS mine
         FROM expert_questions e LEFT JOIN crops c ON c.id = e.crop_id
         WHERE e.status = 'bekliyor' AND ($2 OR e.assigned_to = $1 OR e.assigned_to IS NULL)
         ORDER BY (e.assigned_to = $1) DESC NULLS LAST, e.created_at LIMIT 200`,
        [me.userId, all],
      ),
    );
  }

  /** Uzmanın cevapladığı sorular (son 50). */
  @Get('answered')
  @RequireMfa()
  @Roles('expert', 'admin')
  answered(@Me() me: Principal) {
    return this.data.run(me, 'pusula.answered', (q) =>
      q.query(
        `SELECT e.id, e.question, e.answer, e.answer_source AS "answerSource",
           e.answered_at AS "answeredAt", e.province, e.district, c.name_tr AS "cropName"
         FROM expert_questions e LEFT JOIN crops c ON c.id = e.crop_id
         WHERE e.answered_by = $1 ORDER BY e.answered_at DESC LIMIT 50`,
        [me.userId],
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
    const all = me.roles.includes('admin');
    const asker = await this.data.runOne(me, 'pusula.answer', id, async (q) => {
      // Başka uzmana atanmış soruyu yalnız yönetici cevaplar.
      const rows = await q.query<{ userId: string }>(
        `UPDATE expert_questions
         SET status = 'cevaplandi', answer = $2, answer_source = $3, cacheable = $4,
             answered_by = $5, answered_at = now()
         WHERE id = $1 AND status = 'bekliyor'
           AND ($6 OR assigned_to = $5 OR assigned_to IS NULL)
         RETURNING user_id AS "userId"`,
        [id, a.answer, a.source, a.cacheable, me.userId, all],
      );
      return rows[0];
    });
    // G24: çiftçiye bildirim (zil + telefon bildirimi).
    await systemTx(this.db, (q) =>
      notifyUser(q, this.push, {
        userId: asker.userId,
        kind: 'uzman_cevap',
        title: 'Uzman sorunuza cevap verdi',
        body: a.answer,
        refId: id,
      }),
    );
    return { id, status: 'cevaplandi' };
  }
}
