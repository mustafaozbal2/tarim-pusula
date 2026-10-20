/**
 * Pusula AI güvenlik kapıları (saf, belirlenimci). Model ne derse desin son söz bu kurallarda:
 * doz/karışım isteği reddedilir, doz benzeri çıktı engellenir, atıfsız kart geçmez,
 * dış metinden (kütüphane, kullanıcı) gelen talimat enjeksiyonu yok sayılır.
 */

import { normalizeTr, tokenize } from './rag';

const CHEM =
  /\b(ilac|pestisit|herbisit|fungisit|insektisit|akarisit|zirai ilac|kimyasal|bitki koruma|zehir|gubre|hormon|aktif madde)/;
const DOSE_WORDS =
  /\b(doz|dozu|dozunu|dozaj|karisim|karistir|oran|orani|seyrelt|kac ml|kac cc|kac gr|kac gram|kac kg|kac kilo|kac litre|kac lt|ne kadar|ne kadar atay|dekara|donume|100 litre|litreye|tanka|kac kapak|kac olcek|miktar)/;
const UNIT_QTY = /\d+([.,]\d+)?\s*(ml|cc|gr|gram|g|kg|kilo|litre|lt|l)\b/;

/** Kullanıcı ilaç/gübre dozu ya da karışım oranı mı istiyor? */
export function isDoseRequest(question: string): boolean {
  const n = normalizeTr(question);
  if (/\b(doz|dozu|dozunu|dozaj|karisim orani|karisim oranini|seyreltme)/.test(n)) return true;
  if (CHEM.test(n) && DOSE_WORDS.test(n)) return true;
  if (CHEM.test(n) && UNIT_QTY.test(n)) return true;
  if (
    /\bkac (ml|cc|gr|gram|kg|kilo|litre|lt|kapak|olcek)\b/.test(n) &&
    /\b(dekar|donum|litre su|tank|bidon|pompa)/.test(n)
  )
    return true;
  return false;
}

const INJECTION: RegExp[] = [
  /(onceki|yukaridaki|tum|butun|simdiye kadarki).{0,30}(talimat|kural|komut|yonerge).{0,20}(unut|yok say|gormezden|iptal|gec)/,
  /(kurallari|kisitlamalari|filtreleri|guvenligi) (kapat|yok say|devre disi|kaldir|gormezden)/,
  /ignore (all |the )?(previous|prior|above) (instructions|rules)/,
  /(sistem|system) (istemi|istemini|prompt|promptu|mesaj)/,
  /(sen artik|bundan sonra sen|rolun artik|rol yap)/,
  /(developer|gelistirici|jailbreak|dan) (modu|mode)\b/,
  /\bjailbreak\b/,
  /(gizli|ic) (talimat|anahtar|kurallar)/,
  /api (anahtar|key)/,
  /\b(system|assistant)\b.{0,20}\b(kural|talimat|rule|instruction|yeni|new)\b/,
];

/** Metin, modele yeni talimat vermeye çalışıyor mu (kullanıcıdan ya da getirilen belgeden)? */
export function looksLikeInjection(text: string): boolean {
  if (/<\s*\/?\s*(system|assistant|tool)\s*>/i.test(text)) return true;
  const n = normalizeTr(text);
  return INJECTION.some((re) => re.test(n));
}

const DOSE_OUT: RegExp[] = [
  /\d+([.,]\d+)?\s*(ml|cc|gr|gram|kg|kilo)\b/i,
  /\d+([.,]\d+)?\s*g\b/i,
  /\d+([.,]\d+)?\s*(litre|lt|l)\s*(\/|başına|basina|su\b|ilaç|ilac)/i,
  /\d+([.,]\d+)?\s*(ml|cc|gr|g|gram)?\s*(\/|başına|basina)\s*(da|dekar|dönüm|donum|litre|lt|100)/i,
  /%\s*\d+([.,]\d+)?\s*(lik|luk|'lik|'luk)/i,
  /binde\s*\d/i,
  /\d+\s*:\s*\d+\s*(oran|karış|karis)/i,
];

/** Çıktı doz/karışım oranı gibi görünen bir miktar içeriyor mu? (Su ihtiyacı mm ve sıcaklık serbest.) */
export function containsDose(text: string): boolean {
  return DOSE_OUT.some((re) => re.test(text));
}

export interface CardSource {
  title: string;
  publisher?: string | undefined;
  date: string;
  version?: string | undefined;
  page?: number | undefined;
  /** Uzman onayı yoksa arayüz rozet gösterir. */
  needsBadge: boolean;
}

export type CardKind = 'answer' | 'refusal' | 'handoff' | 'info';

export interface PusulaCard {
  kind: CardKind;
  title: string;
  /** 1-3 kısa adım; yalnız kind='answer'. */
  steps: string[];
  sources: CardSource[];
  /** 'Neden?' arkasındaki teknik ayrıntı. */
  why: string;
  /** Uzman kuyruğuna alındıysa kuyruk kaydı. */
  expertQuestionId?: string | undefined;
  /** Reddin nedeni: arayüz ve eval için makine okunur. */
  reason?:
    | 'doz'
    | 'enjeksiyon'
    | 'yetkisiz'
    | 'kaynak-yok'
    | 'onaysiz'
    | 'veri-yok'
    | 'foto'
    | 'uzman'
    | undefined;
}

export interface CardCheck {
  ok: boolean;
  problems: string[];
}

/** Kart kuralları: kaynak zorunlu, 1-3 adım, doz yok, "Neden?" dolu, onaysız kaynakla adım yok. */
export function checkCard(card: PusulaCard): CardCheck {
  const problems: string[] = [];
  if (!card.title.trim()) problems.push('başlık boş');
  if (!card.why.trim()) problems.push('"Neden?" boş');
  if (card.kind === 'answer') {
    if (card.steps.length < 1 || card.steps.length > 3) problems.push('adım sayısı 1-3 olmalı');
    if (card.sources.length === 0) problems.push('atıfsız cevap');
    if (card.sources.some((s) => s.needsBadge)) problems.push('onaysız kaynakla öneri üretilemez');
  } else if (card.steps.length > 0) {
    problems.push('cevap olmayan kartta adım olamaz');
  }
  for (const s of card.sources) {
    if (!s.title.trim() || !s.date.trim()) problems.push('kaynak künyesi eksik');
  }
  const all = [card.title, card.why, ...card.steps].join(' \n ');
  if (card.kind !== 'refusal' && containsDose(all)) problems.push('doz benzeri miktar');
  return { ok: problems.length === 0, problems };
}

/** BKÜ yönlendirmeli ret metni (doz/karışım). Sabit; model üretmez. */
export const DOSE_REFUSAL = {
  title: 'İlaç miktarını ben söyleyemem',
  why: 'İlaç ve gübre miktarı ürüne, ilacın etiketine ve tarlana göre değişir; yanlış miktar bitkiye, sana ve çevreye zarar verir. Doğru miktar ilacın etiketinde ve ziraat mühendisinin reçetesindedir. Bitki Koruma Ürünleri (BKÜ) kayıt sorgusundan ilacın izinli olduğu ürünü ve etiketini kontrol et.',
  steps: [] as string[],
};

/** Soru kalıbı ve çok genel sözcükler: yalnız bunlar örtüşüyorsa alaka sayılmaz. */
const GENERIC = new Set(
  'ne zaman nasil neden nedir hangi nerede nereden olur olmali yapilir yapilmali alinir alinmali yapayim yapmaliyim var mi mu bana icin ile gibi kac nelerdir nelere dikkat edilir verilir olacak bugun ilgili hakkinda kurallari yontemi yontemleri agac agaci agacl bitki tarla urun urunu bahce bahcem'
    .split(' ')
    .map((w) => w.slice(0, 5)),
);
const contentStems = (s: string) =>
  new Set(
    tokenize(s)
      .map((t) => t.slice(0, 5))
      .filter((t) => !GENERIC.has(t)),
  );

/** Pusula cevabı için kütüphane parçası alakası: kosinüs eşiği VE en az bir ortak içerik sözcüğü kökü. */
export const PUSULA_MIN_SCORE = 0.25;
export function isRelevant(query: string, chunkText: string, score: number): boolean {
  if (score < PUSULA_MIN_SCORE) return false;
  const q = contentStems(query);
  const c = contentStems(chunkText);
  for (const t of q) if (c.has(t)) return true;
  return false;
}
