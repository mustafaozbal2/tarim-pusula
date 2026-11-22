import { describe, expect, it } from 'vitest';
import { hizSiniri } from './hiz-siniri';

function cagir(mw: ReturnType<typeof hizSiniri>, path: string, ip = '1.1.1.1') {
  let durum = 200;
  const res: any = { setHeader() {}, status(s: number) { durum = s; return { json() {} }; } };
  let gecti = false;
  mw({ path, ip } as any, res, () => { gecti = true; });
  return gecti ? 200 : durum;
}

describe('hız sınırı', () => {
  it('genel uçta sınırdan sonra 429, pencere bitince açılır', () => {
    let t = 0;
    const mw = hizSiniri({ genel: 3, yz: 1, simdi: () => t });
    expect([1, 2, 3, 4].map(() => cagir(mw, '/weather'))).toEqual([200, 200, 200, 429]);
    t = 61_000;
    expect(cagir(mw, '/weather')).toBe(200);
  });
  it('yapay zekâ ucu ayrı ve daha sıkı; IP başına ayrı sayılır', () => {
    const mw = hizSiniri({ genel: 100, yz: 1, simdi: () => 0 });
    expect(cagir(mw, '/pusula/ask')).toBe(200);
    expect(cagir(mw, '/pusula/ask')).toBe(429);
    expect(cagir(mw, '/pusula/ask', '2.2.2.2')).toBe(200);
    expect(cagir(mw, '/weather')).toBe(200);
  });
});
