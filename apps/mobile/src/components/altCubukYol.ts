export type Anahtar = 'ana' | 'ikiz' | 'yz' | 'hava' | 'pazar';

/** Alt gezinme çubuğu: üst bantla aynı renk ve dil. Yalnız ana sayfalarda görünür (form ve sohbet ekranlarında yok). */
export const ALT_SEKMELER: { key: Anahtar; ad: string; rota: string; eslesen: RegExp }[] = [
  { key: 'ana', ad: 'Ana sayfa', rota: '/', eslesen: /^\/(index)?$/ },
  { key: 'ikiz', ad: 'İkiz Tarım', rota: '/ikiz-tarim', eslesen: /^\/ikiz-tarim/ },
  { key: 'yz', ad: 'Yapay zekâ', rota: '/yapay-zeka', eslesen: /^\/yapay-zeka/ },
  { key: 'hava', ad: 'Hava', rota: '/hava', eslesen: /^\/hava/ },
  { key: 'pazar', ad: 'Pazar', rota: '/pazar', eslesen: /^\/pazar/ },
];

/** Çubuğun görüneceği sayfalar. */
const GORUNUR =
  /^\/(index|takvim|ikiz-tarim|pazar|hava|tarlalarim|bildirimler|haber|arazi-islemleri|soru-sor)?$/;

export function altCubukGorunur(yol: string): boolean {
  return GORUNUR.test(yol);
}
