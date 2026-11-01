/**
 * Yetki kademesi (G24): kurum türünden yayın kapsamı ve duyuru hedefinin kapsamla denetimi.
 *
 * Kurallar (belirleyici ve test edilmiş):
 *  - Bakanlık ve yönetici (admin): tüm Türkiye (ulusal duyuru, her il/ilçe, daire hedefi).
 *  - İl müdürlüğü: kendi ili ve o ilin ilçeleri. Ulusal duyuru yapamaz.
 *  - İlçe müdürlüğü ve belediye: yalnız kendi ilçesi.
 *  - Ziraat odası, kooperatif, üniversite, araştırma enstitüsü, danışmanlık: kendi ili.
 *  - Ulusal olmayan kapsamda daire (çember) hedefi kullanılamaz: çember il sınırını aşabilir.
 *  - Ürün filtresi kapsamdan bağımsızdır (ör. yalnız Antep fıstığı arazileri).
 */
import { foldTr, type TargetPlace, type Targeting } from './targeting';

export const INSTITUTIONS = [
  'bakanlik',
  'il_mudurlugu',
  'ilce_mudurlugu',
  'belediye',
  'ziraat_odasi',
  'kooperatif',
  'universite',
  'arastirma_enstitusu',
  'danismanlik',
] as const;
export type Institution = (typeof INSTITUTIONS)[number];

export const INSTITUTION_LABEL: Record<Institution, string> = {
  bakanlik: 'Tarım ve Orman Bakanlığı',
  il_mudurlugu: 'İl Tarım ve Orman Müdürlüğü',
  ilce_mudurlugu: 'İlçe Tarım ve Orman Müdürlüğü',
  belediye: 'Belediye',
  ziraat_odasi: 'Ziraat Odası',
  kooperatif: 'Tarım Kredi / Çiftçi Kooperatifi',
  universite: 'Üniversite',
  arastirma_enstitusu: 'Tarımsal Araştırma Enstitüsü',
  danismanlik: 'Tarımsal Danışmanlık',
};

export type Scope =
  | { level: 'ulke' }
  | { level: 'il'; province: string }
  | { level: 'ilce'; province: string; district: string };

/** Kurum türü ve yerinden kapsam. Yönetici (admin) her zaman ulusal. */
export function scopeOf(p: {
  institution: Institution;
  province?: string | null;
  district?: string | null;
  isAdmin?: boolean;
}): Scope {
  if (p.isAdmin || p.institution === 'bakanlik') return { level: 'ulke' };
  if (!p.province) throw new Error('Kapsam için il gerekli');
  if (p.institution === 'ilce_mudurlugu' || p.institution === 'belediye') {
    if (!p.district) throw new Error('İlçe kurumunda ilçe gerekli');
    return { level: 'ilce', province: p.province, district: p.district };
  }
  return { level: 'il', province: p.province };
}

const eq = (a?: string | null, b?: string | null) => !!a && !!b && foldTr(a) === foldTr(b);

/** Bir hedef yerin kapsam içinde olup olmadığı. */
export function placeInScope(s: Scope, p: TargetPlace): boolean {
  if (s.level === 'ulke') return true;
  if (!eq(p.province, s.province)) return false;
  if (s.level === 'il') return true;
  return eq(p.district, s.district);
}

/**
 * Duyuru hedefi bu kapsamda yayınlanabilir mi? Değilse çiftçinin anlayacağı neden döner.
 * Boş yer + çember yok = ulusal duyurudur.
 */
export function checkTargeting(
  s: Scope,
  t: Targeting,
): { ok: true } | { ok: false; reason: string } {
  const places = t.places ?? [];
  if (s.level === 'ulke') return { ok: true };
  if (t.circle) return { ok: false, reason: 'Çember hedefi yalnız ulusal yetkide kullanılabilir' };
  if (places.length === 0) {
    return { ok: false, reason: 'Tüm Türkiye için duyuru yalnız Bakanlık yetkisindedir' };
  }
  const out = places.find((p) => !placeInScope(s, p));
  if (out) {
    return {
      ok: false,
      reason:
        s.level === 'il'
          ? `Yalnız ${s.province} ili ve ilçeleri için duyuru yapabilirsiniz`
          : `Yalnız ${s.province} / ${s.district} için duyuru yapabilirsiniz`,
    };
  }
  return { ok: true };
}

/** Yetkilinin varsayılan hedefi: kendi kapsamı (ürün filtresi boş). */
export function defaultTargeting(s: Scope): Targeting {
  if (s.level === 'ulke') return { places: [], circle: null, cropIds: [] };
  if (s.level === 'il') return { places: [{ province: s.province }], circle: null, cropIds: [] };
  return { places: [{ province: s.province, district: s.district }], circle: null, cropIds: [] };
}

/** Kapsamın kısa adı: "Tüm Türkiye", "Gaziantep ili", "Gaziantep / Şahinbey". */
export function scopeLabel(s: Scope): string {
  if (s.level === 'ulke') return 'Tüm Türkiye';
  if (s.level === 'il') return `${s.province} ili`;
  return `${s.province} / ${s.district}`;
}

export interface ExpertCandidate {
  userId: string;
  province?: string | null;
  district?: string | null;
  institution: Institution;
  expertise: string[];
  openQuestions: number;
}

/**
 * Uzmana sor yönlendirmesi: sorunun yerine (il/ilçe) ve ürününe en yakın uzman.
 * Puan: aynı ilçe 3, aynı il 2, ulusal (bakanlık) 1, başka il 0 (aday olmaz). Ürün uzmanlığı +0,5.
 * Eşitlikte açık sorusu az olan, sonra kullanıcı kimliği (belirleyici).
 */
export function pickExpert(
  q: { province?: string | null; district?: string | null; cropId?: string | null },
  experts: ExpertCandidate[],
): ExpertCandidate | null {
  const scored = experts
    .map((e) => {
      let s = 0;
      if (e.institution === 'bakanlik') s = 1;
      else if (eq(e.province, q.province)) s = eq(e.district, q.district) ? 3 : 2;
      if (s > 0 && q.cropId && e.expertise.includes(q.cropId)) s += 0.5;
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s || a.e.openQuestions - b.e.openQuestions || (a.e.userId < b.e.userId ? -1 : 1),
    );
  return scored[0]?.e ?? null;
}
