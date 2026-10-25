/** Yükleme ekranı en geç bu sürede sonuçlanır: veri, boş durum ya da "Veri alınamadı" (G22.7). */
export const LOAD_DEADLINE_MS = 10_000;

export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`Veri ${Math.round(ms / 1000)} sn içinde alınamadı`);
    this.name = 'DeadlineError';
  }
}

/**
 * Söz verilen işi süre sınırıyla bekler. Süre dolunca DeadlineError ile reddeder; iş arka planda bitse de
 * sonucu yok sayılır. Böylece ağ yavaşken ekran sonsuza dek "yükleniyor"da kalmaz.
 */
export function withDeadline<T>(work: Promise<T>, ms = LOAD_DEADLINE_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError(ms)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
