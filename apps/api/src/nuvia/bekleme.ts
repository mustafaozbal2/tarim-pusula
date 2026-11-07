import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DataService } from '../data.service';
import { CLOCK } from '../weather/tokens';
import type { NuviaClient } from './client';

export const NUVIA = Symbol('NUVIA');

interface Bekleyen {
  id: string;
  question: string;
  province: string | null;
  district: string | null;
  cropName: string | null;
  mime: string | null;
  data: Buffer | null;
}

/**
 * Uzman NUVIA_BEKLEME_SAAT (varsayılan 12) saat içinde cevaplamadıysa soruyu Nuvia'ya gönderir ve geçici
 * yapay zekâ cevabını kaydeder. Soru uzmanda beklemeye devam eder; uzman cevaplayınca o cevap esastır.
 * Aynı soru için en çok bir deneme yapılır (başarısızsa 6 saat sonra yeniden).
 */
@Injectable()
export class NuviaBeklemeService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(CLOCK) private readonly now: () => Date,
    @Inject(NUVIA) private readonly nuvia: NuviaClient,
  ) {}

  onModuleInit(): void {
    if (this.nuvia.id === 'kapali') return;
    const dk = Number(process.env['NUVIA_BEKLEME_TARAMA_DK'] ?? 30);
    if (!Number.isFinite(dk) || dk <= 0) return;
    this.timer = setInterval(() => void this.run().catch(console.error), dk * 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(
    saat = Number(process.env['NUVIA_BEKLEME_SAAT'] ?? 12),
  ): Promise<{ denendi: number; yazildi: number }> {
    const sinir = new Date(this.now().getTime() - saat * 3_600_000);
    const tekrar = new Date(this.now().getTime() - 6 * 3_600_000);
    const rows = await this.data.system((q) =>
      q.query<Bekleyen>(
        `SELECT e.id, e.question, e.province, e.district, c.name_tr AS "cropName",
                i.mime, i.data
         FROM expert_questions e
         LEFT JOIN crops c ON c.id = e.crop_id
         LEFT JOIN expert_question_images i ON i.question_id = e.id
         WHERE e.status = 'bekliyor' AND e.ai_answer IS NULL AND e.created_at < $1
           AND (e.ai_tried_at IS NULL OR e.ai_tried_at < $2)
         ORDER BY e.created_at LIMIT 20`,
        [sinir, tekrar],
      ),
    );
    let yazildi = 0;
    for (const r of rows) {
      await this.data.system((q) =>
        q.query(`UPDATE expert_questions SET ai_tried_at = $2 WHERE id = $1`, [r.id, this.now()]),
      );
      const c = await this.nuvia.soruCevapla({
        soru: r.question,
        il: r.province,
        ilce: r.district,
        urun: r.cropName,
        gorsel: r.data && r.mime ? { mime: r.mime, base64: r.data.toString('base64') } : null,
      });
      if (!c) continue;
      await this.data.system((q) =>
        q.query(
          `UPDATE expert_questions SET ai_answer = $2, ai_source = $3, ai_answered_at = $4
           WHERE id = $1 AND status = 'bekliyor' AND ai_answer IS NULL`,
          [r.id, c.metin, c.kaynak, this.now()],
        ),
      );
      yazildi++;
    }
    return { denendi: rows.length, yazildi };
  }
}
