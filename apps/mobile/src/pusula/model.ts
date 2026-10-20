import type { PusulaCardDto, PusulaSourceDto } from '../api/client';

/** Kaynak satırı: kaynak adı, tarih, varsa sayfa. Her kartta görünür (atıfsız bilgi yok). */
export function sourceLine(s: PusulaSourceDto): string {
  const parts = [s.title, s.date];
  if (s.page !== undefined) parts.push(`sayfa ${s.page}`);
  return parts.join(' · ');
}

export type CardTone = 'ok' | 'warn' | 'stop';

/** Renk tek başına anlam taşımaz; ton yalnız çerçeve rengini seçer, metin her zaman yazılıdır. */
export function cardTone(c: PusulaCardDto): CardTone {
  if (c.kind === 'answer') return 'ok';
  if (c.kind === 'refusal') return c.reason === 'doz' ? 'stop' : 'warn';
  return 'warn';
}

/** Sesli okuma metni: başlık, adımlar, kısa kaynak. Adım yoksa açıklama okunur. */
export function speechText(c: PusulaCardDto): string {
  const parts = [c.title];
  if (c.steps.length > 0) {
    parts.push(...c.steps.map((s, i) => `${i + 1}. adım. ${s}`));
  } else {
    parts.push(c.why);
  }
  if (c.sources.length > 0) parts.push(`Kaynak: ${c.sources.map((s) => s.title).join(', ')}.`);
  return parts.join(' ');
}

/** Ağ hatası mı yoksa sunucu hatası mı: kullanıcıya hangi metin gösterilecek. */
export function errorKey(e: unknown): 'offline' | 'error' {
  return e instanceof Error && e.name === 'NetworkError' ? 'offline' : 'error';
}
