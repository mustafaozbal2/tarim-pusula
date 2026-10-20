import { describe, expect, it } from 'vitest';
import { createI18n, resources } from './i18n';
import { tr } from './i18n/tr';
import { TABS } from './tabs';

function allStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(allStrings);
  return [];
}

describe('sekmeler', () => {
  it('sıra: Bugün, Tarlalarım, Soru sor, Pazar', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Bugün', 'Tarlalarım', 'Soru sor', 'Pazar']);
  });
  it('rota adları benzersiz', () => {
    expect(new Set(TABS.map((t) => t.route)).size).toBe(TABS.length);
  });
});

describe('i18n', () => {
  it('Türkçe varsayılan dildir ve anahtarlar çözülür', async () => {
    const i = createI18n();
    await i.changeLanguage('tr');
    expect(i.t('tabs.ask')).toBe('Soru sor');
    expect(i.t('app.slogan')).toBe('Bilinçli Tarım, Verimli Üretim');
  });
  it('bilinmeyen dilde Türkçeye düşer', () => {
    const i = createI18n('de');
    expect(i.t('tabs.market')).toBe('Pazar');
  });
  it('kaynaklar yalnız tr içerir (şimdilik)', () => {
    expect(Object.keys(resources)).toEqual(['tr']);
  });
});

describe('arayüz metinleri', () => {
  const strings = allStrings(tr);
  it('emoji yok', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    expect(strings.filter((s) => emoji.test(s))).toEqual([]);
  });
  it('örnek veri etiketi vardır; Pazar artık gerçek kaynaklı veri gösterir, örnek rakam taşımaz', () => {
    expect(tr.common.sampleData).toBe('Örnek veri');
    expect(tr.market.source).toBe('Kaynak');
    expect(JSON.stringify(tr.market)).not.toMatch(/\d+ ₺/);
  });
  it('uyarı kartında kaynak etiketi vardır', () => {
    expect(tr.today.frostSource).toBe('Kaynak');
  });
});
