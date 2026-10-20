import { Inject, Injectable } from '@nestjs/common';
import { isRelevant, looksLikeInjection, type CardSource } from '@tarim/agro-core';
import { FieldCalendarController } from '../controllers.g4';
import { DataService } from '../data.service';
import type { Principal } from '../db/db';
import { searchLibrary } from '../library';
import { cropIdFor } from '../market/parse';
import { MarketService } from '../market/service';
import { TodayController } from '../weather/weather.controller';
import type { ToolCall, ToolResultMsg } from './provider';

/** Karta girebilecek tek birim: kaynağı ve onay durumu bilinen kısa bilgi. */
export interface Fact {
  id: string;
  text: string;
  approved: boolean;
  source: CardSource;
}

export interface ToolOutcome {
  result: ToolResultMsg;
  facts: Fact[];
  handoff?: string | undefined;
}

const RELATIVE_CUT = 0.6;
const day = (iso: string) => iso.slice(0, 10);
const mm = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Araçlar kullanıcının kimliğiyle çalışır: tarla okuması RLS altında, başkasının tarlası 403. */
@Injectable()
export class PusulaTools {
  constructor(
    @Inject(DataService) private readonly data: DataService,
    @Inject(TodayController) private readonly today: TodayController,
    @Inject(FieldCalendarController) private readonly calendar: FieldCalendarController,
    @Inject(MarketService) private readonly market: MarketService,
  ) {}

  /** Tarlanın kullanıcıya ait/erişilebilir olduğunu doğrular (değilse ForbiddenException). */
  async fieldInfo(me: Principal, fieldId: string) {
    return this.data.runOne(me, 'pusula.field', fieldId, async (q) => {
      const [f] = await q.query<{
        name: string;
        province: string | null;
        district: string | null;
        cropName: string | null;
      }>(
        `SELECT f.name, f.province, f.district, c.name_tr AS "cropName"
         FROM fields f LEFT JOIN crops c ON c.id = f.crop_id WHERE f.id = $1`,
        [fieldId],
      );
      return f;
    });
  }

  async run(me: Principal, fieldId: string | undefined, call: ToolCall): Promise<ToolOutcome> {
    const ok = (facts: Fact[], content: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({
      facts,
      ...extra,
      result: {
        callId: call.id,
        name: call.name,
        content,
        facts: facts.map((f) => ({ id: f.id, text: f.text, approved: f.approved })),
        unavailable: false,
      },
    });
    /** missing: veri kaynağı hiç yok / tarla seçilmemiş (kullanıcıya "henüz yok" denir); false: yalnız sonuç boş (uzmana gider). */
    const none = (note: string, missing = true): ToolOutcome => {
      const o = ok([], note);
      o.result.unavailable = missing;
      return o;
    };
    const fid = (n: number) => `${call.id}.${n}`;
    const needField = 'Önce bir tarla seçilmeli.';

    switch (call.name) {
      case 'get_field': {
        if (!fieldId) return none(needField);
        const f = await this.fieldInfo(me, fieldId);
        return ok(
          [],
          JSON.stringify({ ad: f.name, il: f.province, ilce: f.district, urun: f.cropName }),
        );
      }
      case 'get_weather': {
        if (!fieldId) return none(needField);
        const t = await this.today.today(me, fieldId);
        const src = (title: string, date: string): CardSource => ({
          title,
          date: day(date),
          version: 'canlı',
          needsBadge: false,
        });
        const facts: Fact[] = [];
        const d = t.weather.today;
        const wsrc = src(t.weather.source, t.weather.fetchedAt);
        facts.push({
          id: fid(1),
          text: `Bugün en düşük ${mm(d.tMinC)} °C, en yüksek ${mm(d.tMaxC)} °C bekleniyor.`,
          approved: true,
          source: wsrc,
        });
        if (d.precipMm !== null) {
          facts.push({
            id: fid(2),
            text:
              d.precipMm >= 0.2
                ? `Bugün yaklaşık ${mm(d.precipMm)} mm yağış bekleniyor.`
                : 'Bugün yağış beklenmiyor.',
            approved: true,
            source: wsrc,
          });
        }
        const fa = t.frost.assessment;
        if (fa.kind === 'frost' && fa.level !== 'none' && t.frost.dayOffset !== null) {
          const when =
            t.frost.dayOffset === 0
              ? 'Bu sabah'
              : t.frost.dayOffset === 1
                ? 'Yarın sabah'
                : `${t.frost.date} sabahı`;
          facts.push({
            id: fid(3),
            text: `${when} don olasılığı yüzde ${Math.round(fa.probability * 100)}.`,
            approved: true,
            source: src(t.frost.source, t.frost.fetchedAt),
          });
        }
        if (t.waterNeed.kind === 'water-need') {
          facts.push({
            id: fid(4),
            text: `Bitkinin bugünkü su ihtiyacı yaklaşık ${mm(t.waterNeed.etcMmPerDay)} mm.`,
            approved: true,
            source: {
              title: `FAO-56 Penman-Monteith; ${t.waterNeed.source ?? 'bitki paketi'}`,
              date: day(t.generatedAt),
              version: `paket ${t.waterNeed.packVersion ?? '-'}`,
              needsBadge: false,
            },
          });
        }
        return ok(facts, 'hava ve hesaplar');
      }
      case 'get_calendar': {
        if (!fieldId) return none(needField);
        const cal = await this.calendar.calendar(me, fieldId, '30');
        const facts: Fact[] = cal.events.slice(0, 3).map((e, i) => ({
          id: fid(i + 1),
          text: `${e.title}: ${e.start} ile ${e.end} arası.`,
          approved: e.actionable,
          source: {
            title: e.source,
            date: e.sourceDate,
            version: e.sourceVersion,
            needsBadge: e.needsBadge,
          },
        }));
        return facts.length
          ? ok(facts, 'takvim')
          : none(cal.note ?? 'Yakın tarihli iş yok.', false);
      }
      case 'search_library': {
        const query =
          typeof call.input['query'] === 'string' ? call.input['query'].slice(0, 300) : '';
        if (!query.trim()) return none('Arama sorgusu boş.', false);
        const hits = await this.data.run(me, 'pusula.library', (q) => searchLibrary(q, query, 10));
        // Dolaylı enjeksiyon: belge metni talimat içeriyorsa hiç kullanılmaz.
        const safe = hits.filter(
          (h) => !looksLikeInjection(h.text) && isRelevant(query, h.text, h.score),
        );
        // Kaynak düzeyi sıralamayı belirler ama alakasız parça kartı kirletmesin: en iyi puanın %60'ının altı elenir.
        const best = Math.max(0, ...safe.map((h) => h.score));
        const relevant = safe.filter((h) => h.score >= RELATIVE_CUT * best).slice(0, 3);
        const facts: Fact[] = relevant.map((h, i) => ({
          id: fid(i + 1),
          text: h.text.length > 280 ? `${h.text.slice(0, 277)}...` : h.text,
          approved: !h.needsBadge,
          source: {
            title: h.source.title,
            publisher: h.source.publisher,
            date: h.source.date,
            version: h.source.version,
            page: h.page,
            needsBadge: h.needsBadge,
          },
        }));
        return facts.length
          ? ok(facts, 'kütüphane')
          : none('Kütüphanede ilgili kaynak yok.', false);
      }
      case 'get_price': {
        // Yalnız kaynak künyeli fiyat olgu olur; ürün tanınmazsa ya da kayıt yoksa "veri yok".
        const text = typeof call.input['crop'] === 'string' ? call.input['crop'] : '';
        const cropId = cropIdFor(text);
        if (!cropId) return none('Hangi ürünün fiyatı sorulduğu anlaşılamadı.');
        const ov = await this.market.overview(me, cropId);
        const c = ov.current;
        if (!c) return none('Bu ürün için kaynaklı fiyat verisi yok.');
        const tl = (n: number) => `${mm(n)} ₺`;
        const src: CardSource = {
          title: c.source.name,
          date: c.source.date,
          version: c.source.version,
          needsBadge: false,
        };
        const facts: Fact[] = [
          {
            id: fid(1),
            text: `${c.name} için ${c.date} tarihli ${ov.cropName.toLowerCase()} fiyatı kilo başına ${tl(c.priceMin)} ile ${tl(c.priceMax)} arasında.`,
            approved: true,
            source: src,
          },
        ];
        if (c.stale)
          facts.push({
            id: fid(2),
            text: 'Bu fiyat eski olabilir, güncel kayıt bulunamadı.',
            approved: true,
            source: src,
          });
        return ok(facts, 'pazar fiyatı');
      }
      case 'find_video':
        return none('Video kataloğu henüz yok.');
      case 'handoff_to_expert':
        return ok([], 'uzmana devredildi', {
          handoff: typeof call.input['reason'] === 'string' ? call.input['reason'] : 'uzman',
        });
      default:
        return none('Bilinmeyen araç.');
    }
  }
}
