import type { TwinDto, TwinScenarioDto, TwinStateDayDto } from '../api/client';

/** İkiz Tarım ekranının saf gösterim mantığı (test edilebilir; React yok). */

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function kisaTarih(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d} ${AYLAR[m - 1] ?? ''}`;
}

export const yuzde = (f: number) => `%${Math.round(f * 100)}`;
export const mm = (v: number) => `${Math.round(v)} mm`;

export type SuDurumu = 'rahat' | 'sinirda' | 'sikintida';

/** Kök bölgesinin durumu: Dr RAW'ın altındaysa rahat, %85-100 arası sınırda, üstünde sıkıntıda. */
export function suDurumu(dr: number, raw: number): SuDurumu {
  if (raw <= 0) return 'rahat';
  if (dr > raw) return 'sikintida';
  if (dr >= 0.85 * raw) return 'sinirda';
  return 'rahat';
}

export function suDurumuMetni(d: SuDurumu): string {
  return d === 'rahat'
    ? 'Bitki suyunu rahat alıyor'
    : d === 'sinirda'
      ? 'Su sınıra yaklaşıyor'
      : 'Bitki su sıkıntısında';
}

/** Kökteki kullanılabilir su oranı (0..1): 1 = tarla kapasitesi, 0 = solma noktası. */
export function doluluk(dr: number, taw: number): number {
  if (taw <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - dr / taw));
}

/**
 * Tahmin günleri için "kaç gün sonra su sıkıntısı" (üyelerin yarısından çoğunun stres yaşadığı ilk gün).
 * Dönem içinde yoksa null.
 */
export function sikintiGunu(s: TwinScenarioDto): { date: string; gun: number } | null {
  const i = s.days.findIndex((d) => d.stressFraction >= 0.5);
  return i < 0 ? null : { date: s.days[i]!.date, gun: i };
}

export interface SenaryoOzeti {
  label: string;
  su: string;
  stres: string;
  verim: string;
  sikinti: string;
  /** Sıralama için: su (az iyi) ve stres (az iyi) dengesi; yalnız kıyas. */
  tone: 'iyi' | 'orta' | 'kotu';
}

export function senaryoOzeti(s: TwinScenarioDto, dekar: number | null): SenaryoOzeti {
  const m3 = dekar ? ` (≈ ${Math.round(s.waterMm.p50 * dekar)} m³)` : '';
  const sik = sikintiGunu(s);
  const vp = s.yieldLoss.fraction;
  const verim =
    vp.p90 < 0.005
      ? 'Verim kaybı beklenmiyor'
      : `Verim kaybı riski ${yuzde(vp.p10)}–${yuzde(vp.p90)}`;
  const stresOrt = s.stressDays.p50;
  return {
    label: s.label,
    su: s.waterMm.p50 === 0 ? 'Su: 0' : `Su: ${mm(s.waterMm.p50)}${m3}, ${s.irrigations} sulama`,
    stres: stresOrt < 0.5 ? 'Stresli gün yok' : `Stresli gün: ${Math.round(stresOrt)}`,
    verim,
    sikinti: sik
      ? sik.gun === 0
        ? 'Bugün su sıkıntısı'
        : `${sik.gun} gün sonra su sıkıntısı (${kisaTarih(sik.date)})`
      : 'Dönem içinde su sıkıntısı beklenmiyor',
    tone: stresOrt < 0.5 && vp.p90 < 0.05 ? 'iyi' : vp.p90 < 0.2 ? 'orta' : 'kotu',
  };
}

export interface GrafikNoktasi {
  date: string;
  /** Doluluk oranı (0..1) p50; geçmişte tek değer. */
  p50: number;
  p10: number;
  p90: number;
  gecmis: boolean;
  sulama: boolean;
  yagis: boolean;
}

/** Zaman çubuğu verisi: son 14 gün (ölçüm/analiz) + tahmin günleri (seçili senaryo). */
export function grafikSerisi(t: TwinDto, s: TwinScenarioDto, gecmisGun = 14): GrafikNoktasi[] {
  const taw = t.state.end.taw;
  const past = t.state.days.slice(-gecmisGun).map((d: TwinStateDayDto) => ({
    date: d.date,
    p50: doluluk(d.drEnd, taw),
    p10: doluluk(d.drEnd + d.sigmaMm, taw),
    p90: doluluk(d.drEnd - d.sigmaMm, taw),
    gecmis: true,
    sulama: d.irrigationMm > 0,
    yagis: d.rainMm >= 2,
  }));
  const fut = s.days.map((d) => ({
    date: d.date,
    p50: doluluk(d.dr.p50, taw),
    p10: doluluk(d.dr.p90, taw),
    p90: doluluk(d.dr.p10, taw),
    gecmis: false,
    sulama: d.irrigationMm > 0.5,
    yagis: false,
  }));
  return [...past, ...fut];
}

/** Bugünün durum kartı metinleri. */
export function durumKarti(t: TwinDto): {
  baslik: string;
  altBaslik: string;
  doluluk: number;
  belirsizlik: string;
  durum: SuDurumu;
} {
  const { dr, raw, taw, sigmaMm } = t.state.end;
  const durum = suDurumu(dr, raw);
  const d = doluluk(dr, taw);
  return {
    baslik: suDurumuMetni(durum),
    altBaslik: `Kökteki su ${yuzde(d)} dolu · eksik ${mm(dr)} (sınır ${mm(raw)})`,
    doluluk: d,
    belirsizlik:
      sigmaMm >= 0.3 * Math.max(taw, 1)
        ? 'Belirsizlik yüksek: sensör ya da sulama kaydı ekleyince netleşir.'
        : `Belirsizlik ±${Math.round(sigmaMm)} mm`,
    durum,
  };
}

/** Öneri kipinde kural senaryosunun kısa öneri cümlesi; bilgi kipinde yalnız gözlem cümlesi. */
export function oneriCumlesi(t: TwinDto): string {
  const kural = t.scenarios.find((s) => s.plan.kind === 'kural');
  const ilk = t.ruleFirstIrrigation;
  if (t.mode !== 'oneri') {
    return ilk
      ? `Hesaba göre kök bölgesi ${kisaTarih(ilk.date)} dolayında sınıra ulaşıyor (bilgi; öneri değil).`
      : 'Hesaba göre önümüzdeki iki hafta su sınırı aşılmıyor (bilgi; öneri değil).';
  }
  if (!ilk || !kural) return 'Önümüzdeki iki hafta sulama gerekmiyor görünüyor.';
  const gun = kural.days.findIndex((d) => d.date === ilk.date);
  const ne = gun <= 0 ? 'Bugün' : gun === 1 ? 'Yarın' : `${gun} gün sonra (${kisaTarih(ilk.date)})`;
  return `${ne} yaklaşık ${mm(ilk.mm)} sulama öneriliyor.`;
}

/** Karne cümlesi. */
export function karneMetni(k: TwinDto['scorecard']): string {
  if (k.count === 0) return 'Henüz doğrulanmış tahmin yok; ilk karne birkaç gün içinde oluşur.';
  return `${k.count} tahmin doğrulandı · ortalama hata ${k.maeMm.toFixed(1)} mm · ${yuzde(k.coverage)} aralık içinde`;
}

/** Senaryoları karşılaştırmak için sıralama: önce az stres, sonra az su. */
export function siralaSenaryolar(list: TwinScenarioDto[]): TwinScenarioDto[] {
  return [...list].sort(
    (a, b) => a.stressDays.p50 - b.stressDays.p50 || a.waterMm.p50 - b.waterMm.p50,
  );
}
