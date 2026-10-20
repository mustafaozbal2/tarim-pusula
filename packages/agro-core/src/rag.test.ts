import { describe, expect, it } from 'vitest';
import {
  chunkPages,
  cosine,
  HashEmbedder,
  normalizeTr,
  rankChunks,
  type Candidate,
  type SourceTier,
} from './rag';

const emb = new HashEmbedder();
const SRC = { title: 'Rehber', publisher: 'Kurum', date: '2026-01-01', version: '1' };

function cand(id: string, text: string, tier: SourceTier = 'genel', source = SRC): Candidate {
  return { chunkId: id, documentId: id, text, page: 1, tier, embedding: emb.embed(text), source };
}

describe('normalizeTr', () => {
  it('Türkçe harfleri sadeleştirir', () => {
    expect(normalizeTr('IŞIK İçin Ğüzel, ÖĞÜT!')).toBe('isik icin guzel ogut');
  });
});

describe('chunkPages', () => {
  const sentence = 'Bu bir deneme cümlesidir ve sulama hakkında bilgi verir.';
  it('sayfa sınırını aşmaz ve sayfa numarasını korur', () => {
    const chunks = chunkPages([
      { page: 3, text: sentence.repeat(1) },
      { page: 4, text: `${sentence} ${sentence}` },
    ]);
    expect(chunks.map((c) => c.page)).toEqual([3, 4]);
    expect(chunks.map((c) => c.seq)).toEqual([0, 1]);
  });
  it('uzun metni üst sınıra göre böler, cümleyi ortadan kesmez, kayıpsız kapsar', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Cümle numara ${i} burada biter.`).join(' ');
    const chunks = chunkPages([{ page: 1, text }], { maxChars: 200, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(200);
      expect(c.text.endsWith('.')).toBe(true);
    }
    const joined = chunks.map((c) => c.text).join(' ');
    for (let i = 0; i < 40; i++) expect(joined).toContain(`Cümle numara ${i} burada biter.`);
  });
  it('ondalık sayıdaki noktada bölmez', () => {
    const chunks = chunkPages([{ page: 1, text: 'Kc değeri 0.7 olur. Sonraki cümle gelir.' }], {
      maxChars: 22,
      overlapChars: 0,
    });
    expect(chunks[0]!.text).toBe('Kc değeri 0.7 olur.');
  });
  it('boş metinde parça üretmez; sonsuz uzun sözcükte takılmaz', () => {
    expect(chunkPages([{ page: 1, text: '  \n ' }])).toEqual([]);
    expect(chunkPages([{ page: 1, text: 'a'.repeat(2000) }], { maxChars: 500 }).length).toBe(1);
  });
});

describe('gömme', () => {
  it('belirlenimci ve birim uzunluklu', () => {
    const a = emb.embed('Domates sulaması');
    expect(a).toEqual(emb.embed('Domates sulaması'));
    expect(Math.hypot(...a)).toBeCloseTo(1, 10);
    expect(cosine(a, a)).toBeCloseTo(1, 10);
  });
  it('boyut uyuşmazlığında hata verir', () => {
    expect(() => cosine([1], [1, 2])).toThrow();
  });
});

/** Altın küme: soru → beklenen parça. */
const CORPUS: Record<string, string> = {
  don: 'İlkbahar geç donları çiçeklenme döneminde meyve ağaçlarında zarar yapar. Don tehlikesinde bahçeye sis veya sisleme uygulanabilir.',
  damla:
    'Damla sulama sistemi suyu bitki kök bölgesine yavaş yavaş verir; yağmurlamaya göre su tasarrufu sağlar.',
  zeytin: 'Zeytin ağacında budama kış sonunda yapılır. Budama ile ağacın içi güneş ışığı alır.',
  toprak: 'Toprak analizi için numune 0-30 cm derinlikten, tarlanın çeşitli yerlerinden alınır.',
  bugday:
    'Buğdayda ekim zamanı sonbaharda ekim ayının ikinci yarısıdır; tohum miktarı dekara 18-20 kg.',
  pamuk: 'Pamukta çapa ve seyreltme, fide çıkışından sonra yapılır.',
  gubre:
    'Azotlu gübre bitkinin hızlı büyüdüğü dönemde parçalı verilir; aşırı azot yaprak yanığına yol açar.',
  hasat: 'Domates hasadı meyveler tam kırmızı renk aldığında sabah serinliğinde yapılır.',
};
const GOLD: [string, string][] = [
  ['geç don bahçeyi nasıl korurum', 'don'],
  ['damla sulama ne işe yarar', 'damla'],
  ['zeytin ne zaman budanır', 'zeytin'],
  ['toprak numunesi nasıl alınır', 'toprak'],
  ['buğday ne zaman ekilir', 'bugday'],
  ['pamuk çapası', 'pamuk'],
  ['azotlu gübre fazla olursa', 'gubre'],
  ['domates hasat zamanı', 'hasat'],
];

describe('arama alaka testi (altın küme)', () => {
  const cands = Object.entries(CORPUS).map(([id, t]) => cand(id, t));
  it('her soruda beklenen parça ilk sırada', () => {
    for (const [q, want] of GOLD) {
      const r = rankChunks(q, cands, emb);
      expect(r[0]?.chunk.chunkId, q).toBe(want);
    }
  });
  it('isabet@1 = %100, ilgisiz soruda boş döner', () => {
    expect(rankChunks('bitcoin fiyatı ne kadar', cands, emb)).toEqual([]);
  });
});

describe('kaynak kuralları', () => {
  it('kaynaksız ya da eksik kaynaklı parça dönmez', () => {
    const t = CORPUS.damla!;
    const list = [
      cand('ok', t),
      { ...cand('yok', t), source: null },
      cand('bos', t, 'genel', { ...SRC, publisher: ' ' }),
      cand('surumsuz', t, 'genel', { ...SRC, version: '' }),
    ];
    expect(rankChunks('damla sulama', list, emb).map((r) => r.chunk.chunkId)).toEqual(['ok']);
  });
  it('uzman onaylı > kurum > genel; eşitlikte benzerlik', () => {
    const t = CORPUS.damla!;
    const list = [
      cand('genel', t, 'genel'),
      cand('kurum', t + ' Ek not.', 'kurum'),
      cand('uzman-zayif', 'damla sulama sistemi', 'uzman-onayli'),
      cand('kurum-iyi', t, 'kurum'),
    ];
    const ids = rankChunks('damla sulama sistemi su tasarrufu', list, emb).map(
      (r) => r.chunk.chunkId,
    );
    expect(ids[0]).toBe('uzman-zayif');
    expect(ids.indexOf('kurum-iyi')).toBeLessThan(ids.indexOf('genel'));
    expect(ids.indexOf('kurum-iyi')).toBeLessThan(ids.indexOf('kurum'));
  });
  it('topK uygulanır', () => {
    const list = Array.from({ length: 10 }, (_, i) => cand('c' + i, CORPUS.damla!));
    expect(rankChunks('damla sulama', list, emb, { topK: 3 })).toHaveLength(3);
  });
});
