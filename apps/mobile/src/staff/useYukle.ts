import { useCallback, useEffect, useState } from 'react';

/** Ekran açılınca veriyi çeker; `reload` ile yeniler. Hata metni ekranda gösterilir, çökmez. */
export function useYukle<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    fetcher().then(
      (d) => {
        setData(d);
        setLoading(false);
      },
      () => {
        setError(true);
        setLoading(false);
      },
    );
    // fetcher her çizimde yeni; ilk açılışta ve elle yenilemede çalışır.
  }, []);
  useEffect(reload, [reload]);
  return { data, error, loading, reload, setData };
}

/** Hedef bölgeyi kısa yazıyla anlatır: "Gaziantep / Nizip, Şanlıurfa" ya da "Tüm Türkiye". */
export function targetText(t: { places?: { province: string; district?: string }[] }): string {
  const places = t.places ?? [];
  if (places.length === 0) return 'Tüm Türkiye';
  return places.map((p) => (p.district ? `${p.province} / ${p.district}` : p.province)).join(', ');
}

/** Tarih: 01.11.2026 14:05 (Türkiye saati, cihaz yereli). */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
