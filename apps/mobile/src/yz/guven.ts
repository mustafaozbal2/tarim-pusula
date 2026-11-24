/**
 * Fotoğraf teşhisinde güven: yapay zekâ ne kadar emin olduğunu söyler. Güven %60'ın altındaysa ya da
 * bilinmiyorsa (model vermediyse) çiftçiye "Emin değilim" denir, olası sebepler ve daha iyi fotoğraf
 * ipuçları gösterilir, uzmana sorma öne çıkar. İlaç dozu burada da yok (kural 2).
 */
export const GUVEN_ESIGI = 60;

export interface Guven {
  /** 0-100; null = bilinmiyor. */
  yuzde: number | null;
  olasilar: string[];
}

export const FOTO_IPUCLARI = [
  'Hasta yaprağı yakından ve gün ışığında çek; gölge ya da flaş olmasın.',
  'Yaprağın hem üstünü hem altını ayrı ayrı çek.',
  'Hastalığın başladığı yer ile sağlam kısım aynı karede görünsün.',
];

export function eminMi(g: Guven): boolean {
  return g.yuzde !== null && g.yuzde >= GUVEN_ESIGI;
}
