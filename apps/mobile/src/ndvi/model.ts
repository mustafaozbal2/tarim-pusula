import type { NdviDto } from '../api/client';
import { tr } from '../i18n/tr';
import { dayText } from '../market/model';

const t = tr.ndvi;

export type Series = Extract<NdviDto, { kind: 'series' }>;

/** 0,6234 -> "0,62" (Türkçe ondalık). */
export function valueText(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

export interface Bar {
  /** 0..1 arası yükseklik oranı (negatif NDVI 0'a kırpılır: grafik su/çıplak yüzeyi göstermez). */
  height: number;
  label: string;
  value: string;
}

/** Çubuk grafik verisi: yükseklik doğrudan NDVI değeridir (0..1 eksen, ölçek uydurması yok). */
export function bars(s: Series): Bar[] {
  return s.points.map((p) => ({
    height: Math.min(1, Math.max(0, p.mean)),
    label: dayText(p.from),
    value: valueText(p.mean),
  }));
}

export function skippedText(s: Series): string | null {
  return s.skipped > 0 ? t.skipped.replace('{{n}}', String(s.skipped)) : null;
}

/** Eğilim cümlesi; düşüşte puan farkı (0,20 -> "20"). */
export function trendText(s: Series): { tone: 'warn' | 'info'; title: string; body: string } {
  const tr_ = s.trend;
  if (tr_.kind === 'drop') {
    return {
      tone: 'warn',
      title: t.dropTitle,
      body: t.dropBody.replace('{{drop}}', String(Math.round(tr_.drop * 100))),
    };
  }
  return { tone: 'info', title: '', body: tr_.kind === 'normal' ? t.normal : t.unknown };
}

export function latestPoint(s: Series): { value: string; date: string } | null {
  const p = s.points[s.points.length - 1];
  return p ? { value: valueText(p.mean), date: dayText(p.from) } : null;
}

/** Kaynak satırı: kaynak adı, veri günü, sürüm. Künyesi eksikse null (gösterilmez). */
export function sourceLine(s: Series): string | null {
  const { name, date, version } = s.source;
  if (!name || !date || !version) return null;
  return `${name} · ${dayText(date)} · ${version}`;
}
