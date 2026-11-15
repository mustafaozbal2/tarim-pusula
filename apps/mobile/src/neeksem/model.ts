import type { NeEksemDto, NeEksemRankedDto } from '../api/client';

/** Ne Eksem ekranının saf gösterim mantığı (test edilebilir; React yok). */

export const yuzde = (f: number) => `%${Math.round(Math.abs(f) * 100)}`;

/** Çiftçi dilinde denge cümlesi: "Türkiye'de açık var: ihtiyacın %37'si dışarıdan". */
export function dengeCumlesi(r: Pick<NeEksemRankedDto, 'gap' | 'band'>): string {
  if (r.gap === null || !r.band) return 'Denge verisi yok';
  const p = yuzde(r.gap);
  switch (r.band) {
    case 'acik-buyuk':
      return `Türkiye'de büyük açık var: ihtiyacın ${p}'i karşılanmıyor`;
    case 'acik':
      return `Türkiye'de açık var: ihtiyacın ${p}'i karşılanmıyor`;
    case 'dengede':
      return 'Türkiye üretimi ihtiyacı karşılıyor (dengede)';
    case 'fazla':
      return `Türkiye'de fazla var: ihtiyaçtan ${p} fazla üretiliyor`;
    case 'cok-fazla':
      return `Türkiye'de çok fazla var: ihtiyacın ${Math.round((1 - r.gap) * 100)}%'i kadar üretiliyor`;
  }
}

/** Çubuk rengi: açık yeşil (fırsat), dengede altın, fazla kiremit. */
export function bantRengi(b: NeEksemRankedDto['band']): 'yesil' | 'altin' | 'kiremit' | 'gri' {
  if (!b) return 'gri';
  if (b === 'acik' || b === 'acik-buyuk') return 'yesil';
  if (b === 'dengede') return 'altin';
  return 'kiremit';
}

/** İlk 3 için yüzde payı (puanların pozitif kısmı); hepsi ≤0 ise eşit pay. */
export function ilkUcPaylari(ranked: readonly NeEksemRankedDto[]): number[] {
  const uc = ranked.slice(0, 3);
  const pos = uc.map((r) => Math.max(0, r.score));
  const top = pos.reduce((a, b) => a + b, 0);
  if (uc.length === 0) return [];
  if (top <= 0) return uc.map(() => Math.round(100 / uc.length));
  const raw = pos.map((p) => (p / top) * 100);
  const r = raw.map(Math.round);
  // Yuvarlama farkını en büyüğe yaz: toplam 100 olsun.
  const diff = 100 - r.reduce((a, b) => a + b, 0);
  r[0] = r[0]! + diff;
  return r;
}

/** Ağaç satırı: çok yıllık ürün için ekstra uyarı (rapor: "ağaç 5 yıl sonra ürüne girer"). */
export function agacSatiri(r: Pick<NeEksemRankedDto, 'lifespan' | 'restricted'>): string | null {
  if (r.lifespan !== 'cok-yillik') return null;
  if (r.restricted) return `Yeni bahçe kısıtlı: ${r.restricted.rule}`;
  return 'Ağaç: dikimden ürüne girmesi yıllar alır; bugünkü açık o güne kalmayabilir.';
}

/** Niyet satırı: bölge toplamı ve varsa benim beyanım. */
export function niyetSatiri(
  r: Pick<NeEksemRankedDto, 'intents' | 'mine' | 'remainingQuota'>,
): string {
  const parca: string[] = [];
  if (r.intents.count > 0)
    parca.push(
      `Bölgende ${r.intents.count} çiftçi toplam ${Math.round(r.intents.decare)} dekar niyet bildirdi`,
    );
  else parca.push('Bölgende henüz niyet beyanı yok');
  if (r.remainingQuota !== null) parca.push(`kalan kota ≈ ${Math.round(r.remainingQuota)} dekar`);
  if (r.mine !== null) parca.push(`senin beyanın ${r.mine} dekar`);
  return parca.join(' · ');
}

export function fiyatSatiri(t: number | null): string | null {
  if (t === null) return null;
  const p = Math.round(t * 100);
  if (Math.abs(p) < 3) return 'Hal fiyatı geçen yıla göre aynı seviyede';
  return `Hal fiyatı geçen yıla göre ${p > 0 ? '+' : ''}${p}%`;
}

export function guvenMetni(c: NeEksemDto['confidence']): string {
  return c === 'yerinde-dogrulanmis'
    ? 'Yerinde doğrulanmış'
    : c === 'uydu-destekli'
      ? 'Uydu destekli'
      : 'Temel (resmî istatistik)';
}

/** Bölge başlığı: "Gaziantep · Nizip (ilçe planı var)". */
export function bolgeBasligi(d: Pick<NeEksemDto, 'province' | 'district' | 'plan'>): string {
  const yer = [d.province, d.district].filter(Boolean).join(' · ') || 'Konum bilinmiyor';
  const plan = d.plan.district
    ? 'ilçe için resmî ürün deseni var'
    : d.plan.provinceRows > 0
      ? 'il geneli resmî ürün deseni'
      : 'resmî ürün deseni yok';
  return `${yer} (${plan})`;
}

/** Niyet girişi doğrulaması: 0'dan büyük, tarla alanını aşmayan dekar. */
export function niyetDogrula(
  metin: string,
  alan: number | null,
): { ok: true; dekar: number } | { ok: false; hata: string } {
  const v = Number(metin.replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return { ok: false, hata: 'Dekar olarak bir sayı yaz.' };
  if (alan !== null && v > alan * 1.05)
    return { ok: false, hata: `Tarlan ${Math.round(alan)} dekar; daha fazlasını beyan edemezsin.` };
  return { ok: true, dekar: Math.round(v * 10) / 10 };
}
