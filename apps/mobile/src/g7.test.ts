import { describe, expect, it } from 'vitest';
import type { PusulaCardDto } from './api/client';
import { cardTone, errorKey, sourceLine, speechText } from './pusula/model';

const card: PusulaCardDto = {
  kind: 'answer',
  title: 'Budama',
  steps: ['Kış sonunda buda.', 'Ağacın içini aç.'],
  sources: [{ title: 'Zeytin Rehberi', date: '2025-03-01', page: 4, needsBadge: false }],
  why: 'Kaynakta yazıyor.',
};

describe('Pusula kartı', () => {
  it('kaynak satırı ad, tarih ve sayfayı gösterir', () => {
    expect(sourceLine(card.sources[0]!)).toBe('Zeytin Rehberi · 2025-03-01 · sayfa 4');
    expect(sourceLine({ title: 'A', date: '2025-01-01', needsBadge: false })).toBe(
      'A · 2025-01-01',
    );
  });
  it('sesli okuma başlık + adımlar + kaynağı birleştirir', () => {
    expect(speechText(card)).toBe(
      'Budama 1. adım. Kış sonunda buda. 2. adım. Ağacın içini aç. Kaynak: Zeytin Rehberi.',
    );
  });
  it('adımsız kartta sesli okuma açıklamayı okur', () => {
    const r: PusulaCardDto = {
      kind: 'refusal',
      title: 'Olmaz',
      steps: [],
      sources: [],
      why: 'Etikete bak.',
    };
    expect(speechText(r)).toBe('Olmaz Etikete bak.');
  });
  it('ton: cevap=ok, doz reddi=stop, diğerleri=warn', () => {
    expect(cardTone(card)).toBe('ok');
    expect(cardTone({ ...card, kind: 'refusal', reason: 'doz' })).toBe('stop');
    expect(cardTone({ ...card, kind: 'handoff' })).toBe('warn');
  });
  it('ağ hatası ayrı mesaj alır', () => {
    const e = new Error('x');
    e.name = 'NetworkError';
    expect(errorKey(e)).toBe('offline');
    expect(errorKey(new Error('y'))).toBe('error');
  });
});
