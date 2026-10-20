export interface Clock {
  now(): number;
  /** Zamanlayıcı kurar; dönen işlev iptal eder. */
  setTimeout(fn: () => void, ms: number): () => void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
};

interface Timer {
  at: number;
  fn: () => void;
}

/** Test ve ölçüm için elle ilerletilen saat; zamanlayıcılar vade sırasıyla tetiklenir. */
export class ManualClock implements Clock {
  private t: number;
  private seq = 0;
  private timers = new Map<number, Timer>();
  constructor(start = 1_700_000_000_000) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): () => void {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return () => void this.timers.delete(id);
  }
  /** Saati ms kadar ilerletir; arada vadesi gelen zamanlayıcıları çalıştırır. */
  advance(ms: number): void {
    const target = this.t + ms;
    for (;;) {
      let next: [number, Timer] | undefined;
      for (const e of this.timers) {
        if (e[1].at <= target && (!next || e[1].at < next[1].at)) next = e;
      }
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      next[1].fn();
    }
    this.t = target;
  }
}
