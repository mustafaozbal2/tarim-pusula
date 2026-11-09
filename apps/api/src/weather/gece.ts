/**
 * Gece donu ve hava tehlikeleri (meteorolojik olgu; ürün eşiğinden bağımsız).
 *
 * Tanımlar ve kaynaklar:
 *  - Hava donu: 2 m hava sıcaklığı ≤ 0 °C (WMO, International Meteorological Vocabulary, WMO-No.182).
 *  - Don türü (Snyder & de Melo-Abreu 2005, FAO "Frost Protection: fundamentals, practice and economics",
 *    Cilt 1, Bölüm 2): RADYASYON donu açık ve durgun gecede oluşur (rüzgâr < 2 m/s, bulut az); ADVEKSİYON
 *    donu soğuk hava kütlesinin rüzgârla gelmesidir (rüzgâr > 2 m/s, bulut olabilir). Radyasyon gecesinde
 *    bitki yüzeyi hava sıcaklığından birkaç derece soğuk olabilir (aynı kaynak); bu yüzden yalnız bilgi
 *    olarak "yüzey daha soğuk olabilir" denir, sayı uydurulmaz.
 *  - Kuvvetli rüzgâr: hamle ≥ 13,9 m/s (Beaufort 7 alt sınırı, WMO).
 *  - Kar: günlük kar yağışı ≥ 0,5 cm (Open-Meteo `snowfall_sum`).
 *  - Kuvvetli yağış: günlük ≥ 25 mm.
 * Bu bilgiler uyarı DEĞİL tahmin olgusudur; ürün zararı için uzman onaylı eşik gerekir (kural 1).
 */
export interface SaatlikHava {
  /** Yerel saat, "YYYY-MM-DDTHH:00". */
  time: string;
  tempC: number | null;
  dewC: number | null;
  windMs: number | null;
  cloudPct: number | null;
  snowCm: number | null;
  precipMm: number | null;
}

export type DonTuru = 'radyasyon' | 'adveksiyon' | 'karisik';

export interface GeceDonu {
  /** Bu gece (yerel 18:00 - ertesi 09:00) hava sıcaklığı 0 °C ve altına iniyor mu. */
  var: boolean;
  /** Gece penceresinin tarihi (sabahın tarihi). */
  sabah: string;
  enDusukC: number | null;
  enDusukSaat: string | null;
  /** 0 °C altındaki ilk ve son saat ("03:00"). */
  baslangic: string | null;
  bitis: string | null;
  /** 0 °C altındaki saat sayısı. */
  sure: number;
  tur: DonTuru | null;
  /** Grafik: gecenin saatlik sıcaklıkları. */
  saatler: { saat: string; tempC: number }[];
  ortRuzgarMs: number | null;
  ortBulutPct: number | null;
}

export const DON_ESIK_C = 0;
export const RUZGAR_ESIK_MS = 13.9;
export const KAR_ESIK_CM = 0.5;
export const YAGIS_ESIK_MM = 25;

const ort = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};
const saat = (t: string) => t.slice(11, 16);

/** Don türü: Snyder & de Melo-Abreu (2005) ölçütleri. */
export function donTuru(ruzgarMs: number | null, bulutPct: number | null): DonTuru {
  if (ruzgarMs !== null && ruzgarMs > 2) return 'adveksiyon';
  if ((ruzgarMs === null || ruzgarMs < 2) && (bulutPct === null || bulutPct <= 30))
    return 'radyasyon';
  return 'karisik';
}

/**
 * Bu gecenin penceresi: yerel saat 18:00'den (ya da şimdiden, hangisi geçse) ertesi sabah 09:00'a.
 * Saat 09:00'dan önce ise pencere bu sabahtır (gece içindeyiz).
 */
export function geceDonu(hourly: SaatlikHava[], nowLocal: string): GeceDonu {
  const bugun = nowLocal.slice(0, 10);
  const h = Number(nowLocal.slice(11, 13));
  const gun = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const sabah = h < 9 ? bugun : gun(bugun, 1);
  const bas = `${gun(sabah, -1)}T18:00`;
  const son = `${sabah}T09:00`;
  const pencere = hourly.filter((x) => x.time >= bas && x.time <= son && x.tempC !== null);
  const kalan = pencere.filter((x) => x.time >= nowLocal.slice(0, 13) + ':00');
  const bakilan = kalan.length > 0 ? kalan : pencere;
  const soguk = bakilan.filter((x) => (x.tempC as number) <= DON_ESIK_C);
  const enDusuk = bakilan.reduce<SaatlikHava | null>(
    (m, x) => (m === null || (x.tempC as number) < (m.tempC as number) ? x : m),
    null,
  );
  const ruzgar = ort(soguk.map((x) => x.windMs));
  const bulut = ort(soguk.map((x) => x.cloudPct));
  return {
    var: soguk.length > 0,
    sabah,
    enDusukC: enDusuk ? Math.round((enDusuk.tempC as number) * 10) / 10 : null,
    enDusukSaat: enDusuk ? saat(enDusuk.time) : null,
    baslangic: soguk[0] ? saat(soguk[0].time) : null,
    bitis: soguk.length ? saat(soguk[soguk.length - 1]!.time) : null,
    sure: soguk.length,
    tur: soguk.length ? donTuru(ruzgar, bulut) : null,
    saatler: pencere.map((x) => ({
      saat: saat(x.time),
      tempC: Math.round((x.tempC as number) * 10) / 10,
    })),
    ortRuzgarMs: ruzgar,
    ortBulutPct: bulut,
  };
}

export interface Tehlike {
  tur: 'don' | 'kar' | 'ruzgar' | 'yagis';
  tarih: string;
  gunFarki: number;
  deger: number;
  baslik: string;
}

export interface GunlukOzet {
  date: string;
  tMinC: number;
  precipMm: number | null;
  snowCm?: number | null;
  gustMaxMs?: number | null;
}

const gunAdi = (n: number) => (n <= 0 ? 'Bugün' : n === 1 ? 'Yarın' : `${n} gün sonra`);

/** Önümüzdeki 7 günün hava tehlikeleri (olgu; kaynak: tahmin). */
export function tehlikeler(days: GunlukOzet[], bugun: string): Tehlike[] {
  const t0 = Date.parse(`${bugun}T00:00:00Z`);
  const out: Tehlike[] = [];
  for (const d of days) {
    const n = Math.round((Date.parse(`${d.date}T00:00:00Z`) - t0) / 86_400_000);
    if (n < 0 || n > 6) continue;
    if (d.tMinC <= DON_ESIK_C)
      out.push({
        tur: 'don',
        tarih: d.date,
        gunFarki: n,
        deger: d.tMinC,
        baslik: `${gunAdi(n)} hava donu: en düşük ${Math.round(d.tMinC)}°`,
      });
    if ((d.snowCm ?? 0) >= KAR_ESIK_CM)
      out.push({
        tur: 'kar',
        tarih: d.date,
        gunFarki: n,
        deger: d.snowCm!,
        baslik: `${gunAdi(n)} kar bekleniyor (${Math.round(d.snowCm! * 10) / 10} cm)`,
      });
    if ((d.gustMaxMs ?? 0) >= RUZGAR_ESIK_MS)
      out.push({
        tur: 'ruzgar',
        tarih: d.date,
        gunFarki: n,
        deger: d.gustMaxMs!,
        baslik: `${gunAdi(n)} kuvvetli rüzgâr (hamle ${Math.round(d.gustMaxMs! * 3.6)} km/sa)`,
      });
    if ((d.precipMm ?? 0) >= YAGIS_ESIK_MM)
      out.push({
        tur: 'yagis',
        tarih: d.date,
        gunFarki: n,
        deger: d.precipMm!,
        baslik: `${gunAdi(n)} kuvvetli yağış (${Math.round(d.precipMm!)} mm)`,
      });
  }
  return out;
}

/** Bildirim metni: "Bu gece Ev arazinizde don bekleniyor: 03:00-07:00 arası -2°." */
export function donBildirimi(arazi: string, g: GeceDonu): string {
  const aralik = g.baslangic && g.bitis ? `${g.baslangic}-${g.bitis} arası ` : '';
  return `Bu gece ${arazi} arazinizde don bekleniyor: ${aralik}en düşük ${g.enDusukC}°. Ne yapabileceğinizi görmek için Tarım Pusula'yı açın.`;
}
