import { describe, expect, it } from 'vitest';
import { decideDelivery, gruplaSatir, paketle, type Uyari } from './index';

const u = (o: Partial<Uyari> & Pick<Uyari, 'oncelik' | 'dedupeKey'>): Uyari => ({
  userId: 'a',
  kind: 'info',
  baslik: 'Yarın kar bekleniyor',
  metin: 'metin',
  satir: o.dedupeKey,
  ...o,
});
const gece = new Date('2026-11-23T20:00:00Z'); // yerel 23:00

describe('bildirim önceliği', () => {
  it('tek uyarı kendi metniyle gider; aynı önemde birden fazlası tek bildirimde toplanır', () => {
    const isler = paketle(
      [
        u({ oncelik: 'onemli', dedupeKey: 'kar:1' }),
        u({ oncelik: 'kritik', dedupeKey: 'don:1', kind: 'frost', baslik: 'Bu gece don' }),
        u({ oncelik: 'kritik', dedupeKey: 'don:2', kind: 'frost', baslik: 'Bu gece don' }),
        u({ oncelik: 'kritik', dedupeKey: 'yagis:3', baslik: 'Yarın kuvvetli yağış' }),
        u({ oncelik: 'onemli', dedupeKey: 'b', userId: 'b' }),
      ],
      { ozetZamani: false, gun: '2026-11-23' },
    );
    expect(isler.map((i) => [i.userId, i.oncelik, i.title])).toEqual([
      ['a', 'kritik', '3 acil uyarı'],
      ['a', 'onemli', 'Yarın kar bekleniyor'],
      ['b', 'onemli', 'Yarın kar bekleniyor'],
    ]);
    const toplu = isler[0]!;
    expect(toplu.kind).toBe('frost');
    expect(toplu.anahtarlar).toEqual(['don:1', 'don:2', 'yagis:3']);
    expect(toplu.body).toBe('Bu gece don: don:1, don:2\nYarın kuvvetli yağış: yagis:3');
    // aynı küme aynı anahtarı verir (ikinci tarama çift göndermez)
    expect(
      paketle([...[0, 1, 2].map((i) => u({ oncelik: 'kritik', dedupeKey: `k${i}` }))], {
        ozetZamani: false,
        gun: 'x',
      })[0]!.dedupeKey,
    ).toBe(
      paketle(
        [2, 1, 0].map((i) => u({ oncelik: 'kritik', dedupeKey: `k${i}` })),
        { ozetZamani: false, gun: 'x' },
      )[0]!.dedupeKey,
    );
  });

  it('bilgi düzeyi yalnız özet zamanında, gün başına tek "Günlük özet" olur', () => {
    const bilgi = [
      u({ oncelik: 'bilgi', dedupeKey: 'x' }),
      u({ oncelik: 'bilgi', dedupeKey: 'y' }),
    ];
    expect(paketle(bilgi, { ozetZamani: false, gun: '2026-11-23' })).toEqual([]);
    const [ozet] = paketle(bilgi, { ozetZamani: true, gun: '2026-11-23' });
    expect(ozet).toMatchObject({
      title: 'Günlük özet',
      dedupeKey: 'ozet:2026-11-23',
      kind: 'info',
    });
    expect(ozet!.anahtarlar).toEqual(['x', 'y']);
  });

  it('çok satır kısaltılır; kritik sessiz saatte de gider, önemli sabaha kalır', () => {
    const cok = Array.from({ length: 7 }, (_, i) =>
      u({ oncelik: 'bilgi', dedupeKey: `${i}`, baslik: `B${i}` }),
    );
    expect(gruplaSatir(cok).at(-1)).toBe('ve 2 uyarı daha');
    expect(decideDelivery('info', gece, 'kritik').action).toBe('send');
    expect(decideDelivery('info', gece, 'onemli').action).toBe('defer');
  });
});
