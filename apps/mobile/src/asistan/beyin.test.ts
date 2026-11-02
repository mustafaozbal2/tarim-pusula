import { describe, expect, it } from 'vitest';
import { nuviaBeyni, yerelBeyin } from './beyin';

const yanit = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('asistan beyni', () => {
  it('yerel: ağsız eşler', async () => {
    expect((await yerelBeyin.anla('tarla ekle'))?.key).toBe('tarla-ekle');
  });
  it('Nuvia geçerli eylem dönerse onu kullanır', async () => {
    const b = nuviaBeyni('https://nuvia.example', yanit(200, { eylem: 'sulama' }));
    expect((await b.anla('bahçem susadı galiba'))?.key).toBe('sulama');
  });
  it('Nuvia serbest metin ya da bilinmeyen eylem dönerse kabul etmez, yerele düşer', async () => {
    const b = nuviaBeyni(
      'https://nuvia.example',
      yanit(200, { eylem: 'ilac-dozu', cevap: '5 ml' }),
    );
    expect((await b.anla('hava nasıl'))?.key).toBe('hava');
    expect(await b.anla('merhaba')).toBeNull();
  });
  it('Nuvia ulaşılamazsa yerel eşleyici', async () => {
    const down = (async () => {
      throw new Error('ağ yok');
    }) as unknown as typeof fetch;
    expect((await nuviaBeyni('https://x', down).anla('uzmana sor'))?.key).toBe('uzmana-sor');
  });
});
