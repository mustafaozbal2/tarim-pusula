import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import {
  checkCard,
  containsDose,
  DOSE_REFUSAL,
  isDoseRequest,
  looksLikeInjection,
  normalizeTr,
  type CardSource,
  type PusulaCard,
} from '@tarim/agro-core';
import type { PusulaAsk } from '@tarim/schemas';
import { DataService } from '../data.service';
import type { Principal, Queryable } from '../db/db';
import {
  SYSTEM_PROMPT,
  type CardDraft,
  type LlmProvider,
  type Step,
  type ToolCall,
} from './provider';
import { PusulaTools, type Fact } from './tools';

export const LLM = Symbol('LLM');
const MAX_ROUNDS = 3;
const MAX_STEPS = 3;

type Reason = NonNullable<PusulaCard['reason']>;
/** Uzman kuyruğuna yazılan nedenler (veritabanı CHECK ile aynı). */
type QueueReason = 'kaynak-yok' | 'onaysiz' | 'veri-yok' | 'foto' | 'uzman' | 'riskli';

const BKU_NOTE =
  'İlaç gerekiyorsa miktarı ve karışımı ilacın etiketinden ve ziraat mühendisinden öğren.';

const IMAGE_MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export const normQuestion = normalizeTr;

function dedupeSources(facts: Fact[]): CardSource[] {
  const seen = new Set<string>();
  const out: CardSource[] = [];
  for (const f of facts) {
    const k = `${f.source.title}|${f.source.version ?? ''}|${f.source.page ?? ''}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(f.source);
    }
  }
  return out;
}

export interface AskResult {
  card: PusulaCard;
}

@Injectable()
export class PusulaService {
  private readonly log = new Logger('Pusula');

  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(PusulaTools) private readonly tools: PusulaTools,
    @Inject(LLM) private readonly llm: LlmProvider,
  ) {}

  async ask(me: Principal, input: PusulaAsk): Promise<AskResult> {
    const card = await this.answer(me, input);
    await this.audit(me, card);
    return { card };
  }

  private async audit(me: Principal, card: PusulaCard) {
    // Soru metni KVKK gereği denetim kaydına yazılmaz; yalnız sonuç türü.
    await this.data.run(me, 'pusula.audit', (q) =>
      q.query('SELECT write_audit($1, $2, $3, $4::jsonb)', [
        'pusula.ask',
        'pusula',
        me.userId,
        JSON.stringify({ kind: card.kind, reason: card.reason ?? null, provider: this.llm.id }),
      ]),
    );
  }

  private refusal(reason: Reason, title: string, why: string): PusulaCard {
    return { kind: 'refusal', title, steps: [], sources: [], why, reason };
  }

  private async answer(me: Principal, input: PusulaAsk): Promise<PusulaCard> {
    const { question } = input;
    // 1) Talimat enjeksiyonu denemesi (en özel durum; doz isteğiyle birlikte gelse de önce bu).
    if (looksLikeInjection(question)) {
      return this.refusal(
        'enjeksiyon',
        'Bu isteği yerine getiremem',
        'Kurallarımı değiştirmemi isteyen sorulara cevap vermem. Tarlanla ilgili bir şey sorarsan yardımcı olurum.',
      );
    }
    // 2) Doz / karışım: modele hiç sorulmaz.
    if (isDoseRequest(question)) {
      return this.refusal('doz', DOSE_REFUSAL.title, `${DOSE_REFUSAL.why}`);
    }
    // 3) Tarla yetkisi: başkasının tarlası için hiçbir veri toplanmaz.
    let fieldName: string | undefined;
    if (input.fieldId) {
      try {
        fieldName = (await this.tools.fieldInfo(me, input.fieldId)).name;
      } catch (e) {
        if (e instanceof ForbiddenException) {
          return this.refusal(
            'yetkisiz',
            'Bu tarla sana ait değil',
            'Yalnız kendi tarlanın ya da seninle paylaşılan tarlanın bilgisini görebilirsin.',
          );
        }
        throw e;
      }
    }
    // 4) Fotoğraf: kesin teşhis yok; uzmana gider.
    if (input.image) {
      const bytes = Buffer.from(input.image.base64, 'base64');
      if (bytes.length === 0 || !IMAGE_MAGIC[input.image.mime]!(bytes)) {
        return this.refusal('foto', 'Fotoğraf okunamadı', 'Fotoğrafı yeniden çekip gönder.');
      }
      return this.handoff(
        me,
        input,
        'foto',
        [],
        'Fotoğrafını bir ziraat mühendisine ilettim. Cevap gelince burada göreceksin.',
      );
    }
    // 5) Uzmanın daha önce önbelleğe aldığı cevap.
    const cached = await this.data.run(me, 'pusula.cache', (q) =>
      q.query<{ answer: string; answerSource: string; answeredAt: Date | string }>(
        'SELECT answer, answer_source AS "answerSource", answered_at AS "answeredAt" FROM expert_cache_lookup($1)',
        [normQuestion(question)],
      ),
    );
    if (cached[0]) {
      const c = cached[0];
      const card: PusulaCard = {
        kind: 'answer',
        title: 'Uzman cevabı',
        steps: [c.answer],
        sources: [
          {
            title: c.answerSource,
            date: new Date(c.answeredAt).toISOString().slice(0, 10),
            version: 'uzman',
            needsBadge: false,
          },
        ],
        why: 'Bu soruya daha önce bir ziraat mühendisi cevap verdi.',
      };
      if (checkCard(card).ok) return card;
    }
    // 6) Model + araçlar.
    try {
      return await this.withModel(me, input, fieldName);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.log.warn(`model hatası: ${(e as Error).message}`);
      return this.handoff(
        me,
        input,
        'kaynak-yok',
        [],
        'Şu an cevap hazırlayamadım. Sorunu uzmana ilettim.',
      );
    }
  }

  private async withModel(
    me: Principal,
    input: PusulaAsk,
    fieldName?: string,
  ): Promise<PusulaCard> {
    const transcript: Step[] = [];
    const facts = new Map<string, Fact>();
    let handoffReason: string | undefined;
    let unavailable = false;
    let counter = 0;
    let draft: CardDraft | undefined;

    for (let round = 0; round < MAX_ROUNDS && !draft; round++) {
      const turn = await this.llm.generate({
        system: SYSTEM_PROMPT,
        question: input.question,
        hasField: fieldName !== undefined,
        transcript,
      });
      if (turn.kind === 'final') {
        draft = turn.draft;
        break;
      }
      // Kimlikler sunucuda yeniden atanır; tarla kimliği modelin değil oturumun.
      const calls: ToolCall[] = turn.calls.slice(0, 4).map((c) => ({ ...c, id: `t${++counter}` }));
      const results = [];
      for (const call of calls) {
        const out = await this.tools.run(me, input.fieldId, call);
        results.push(out.result);
        unavailable ||= out.result.unavailable;
        if (out.handoff) handoffReason = out.handoff;
        for (const f of out.facts) facts.set(f.id, f);
      }
      transcript.push({ calls, results });
    }
    if (!draft) {
      return this.handoff(
        me,
        input,
        'kaynak-yok',
        [...facts.values()],
        'Cevabı tamamlayamadım. Sorunu uzmana ilettim.',
      );
    }
    if (draft.handoff || handoffReason) {
      const shown = [...facts.values()].filter((f) => !f.approved);
      return this.handoff(
        me,
        input,
        'uzman',
        shown,
        'Bunu bir ziraat mühendisinin görmesi daha doğru. Sorunu ilettim.',
      );
    }

    // Adım doğrulama: her adım en az bir olguya bağlı, olguların hepsi onaylı, doz/enjeksiyon yok.
    const steps: string[] = [];
    const used: Fact[] = [];
    for (const s of draft.steps) {
      const refs = s.factIds.map((id) => facts.get(id));
      if (refs.length === 0 || refs.some((f) => !f || !f.approved)) continue;
      const text = s.text.trim();
      if (!text || containsDose(text) || looksLikeInjection(text)) continue;
      steps.push(text);
      used.push(...(refs as Fact[]));
      if (steps.length === MAX_STEPS) break;
    }
    const all = [...facts.values()];
    if (steps.length === 0) {
      const draftOnly = all.filter((f) => !f.approved);
      if (draftOnly.length > 0) {
        return this.handoff(
          me,
          input,
          'onaysiz',
          draftOnly,
          'Bu konuda yalnız uzman onayı bekleyen bilgi var; onu öneri olarak veremem. Sorunu uzmana ilettim.',
        );
      }
      if (unavailable && all.length === 0) {
        return {
          kind: 'info',
          title: 'Bu bilgi henüz yok',
          steps: [],
          sources: [],
          why: 'Bu konudaki veri kaynağı henüz uygulamaya bağlı değil. Uydurma bilgi vermem.',
          reason: 'veri-yok',
        };
      }
      return this.handoff(
        me,
        input,
        'kaynak-yok',
        [],
        'Güvenilir bir kaynak bulamadım. Sorunu uzmana ilettim.',
      );
    }
    const title =
      draft.title.trim() && !containsDose(draft.title) ? draft.title.trim() : 'Sorunun cevabı';
    const withBku = /\b(ilac|zararli|hastalik|bocek|mantar)/.test(normalizeTr(input.question));
    const card: PusulaCard = {
      kind: 'answer',
      title,
      steps,
      sources: dedupeSources(used),
      why: [
        draft.why.trim() && !containsDose(draft.why)
          ? draft.why.trim()
          : 'Cevap, adı yazılı kaynaklardan geldi.',
        withBku ? BKU_NOTE : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
    if (checkCard(card).ok) return card;
    return this.handoff(
      me,
      input,
      'riskli',
      [],
      'Cevabı güvenli biçimde hazırlayamadım. Sorunu uzmana ilettim.',
    );
  }

  /** Soruyu uzman kuyruğuna alır ve çiftçiye dürüst bir "uzmana soruldu" kartı döner. */
  private async handoff(
    me: Principal,
    input: PusulaAsk,
    reason: QueueReason,
    shown: Fact[],
    why: string,
  ): Promise<PusulaCard> {
    const id = await this.data.run(me, 'pusula.enqueue', (q) => this.enqueue(q, me, input, reason));
    return {
      kind: 'handoff',
      title: 'Uzmana soruldu',
      steps: [],
      // Onaysız kaynaklar yalnız bilgi olarak, rozetli gösterilir; öneri üretmez.
      sources: dedupeSources(shown.filter((f) => !f.approved)).map((s) => ({
        ...s,
        needsBadge: true,
      })),
      why,
      expertQuestionId: id,
      reason: reason === 'riskli' ? 'kaynak-yok' : reason,
    };
  }

  private async enqueue(q: Queryable, me: Principal, input: PusulaAsk, reason: QueueReason) {
    const [row] = await q.query<{ id: string }>(
      `INSERT INTO expert_questions(user_id, field_id, question, question_norm, reason, has_image)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        me.userId,
        input.fieldId ?? null,
        input.question,
        normQuestion(input.question),
        reason,
        !!input.image,
      ],
    );
    if (input.image) {
      await q.query(
        `INSERT INTO expert_question_images(question_id, mime, data) VALUES ($1,$2,decode($3,'base64'))`,
        [row!.id, input.image.mime, input.image.base64],
      );
    }
    return row!.id;
  }
}
