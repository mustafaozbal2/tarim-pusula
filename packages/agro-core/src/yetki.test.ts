import { describe, expect, it } from 'vitest';
import {
  checkTargeting,
  defaultTargeting,
  pickExpert,
  scopeLabel,
  scopeOf,
  type ExpertCandidate,
} from './yetki';

describe('yetki kademesi: kapsam', () => {
  it('bakanlık ve admin ulusal; il müdürlüğü il; ilçe müdürlüğü ve belediye ilçe; diğerleri il', () => {
    expect(scopeOf({ institution: 'bakanlik' })).toEqual({ level: 'ulke' });
    expect(
      scopeOf({
        institution: 'ilce_mudurlugu',
        province: 'Gaziantep',
        district: 'Şahinbey',
        isAdmin: true,
      }),
    ).toEqual({ level: 'ulke' });
    expect(
      scopeOf({ institution: 'il_mudurlugu', province: 'Gaziantep', district: 'Şahinbey' }),
    ).toEqual({ level: 'il', province: 'Gaziantep' });
    expect(
      scopeOf({ institution: 'ilce_mudurlugu', province: 'Gaziantep', district: 'Şahinbey' }),
    ).toEqual({ level: 'ilce', province: 'Gaziantep', district: 'Şahinbey' });
    expect(
      scopeOf({ institution: 'belediye', province: 'Gaziantep', district: 'Nizip' }).level,
    ).toBe('ilce');
    expect(scopeOf({ institution: 'universite', province: 'Gaziantep' }).level).toBe('il');
    expect(() => scopeOf({ institution: 'ilce_mudurlugu', province: 'Gaziantep' })).toThrow();
  });
  it('kapsam adları', () => {
    expect(scopeLabel({ level: 'ulke' })).toBe('Tüm Türkiye');
    expect(scopeLabel({ level: 'ilce', province: 'Gaziantep', district: 'Şahinbey' })).toBe(
      'Gaziantep / Şahinbey',
    );
  });
});

describe('yetki kademesi: duyuru hedefi denetimi', () => {
  const ulke = { level: 'ulke' } as const;
  const il = { level: 'il', province: 'Gaziantep' } as const;
  const ilce = { level: 'ilce', province: 'Gaziantep', district: 'Şahinbey' } as const;

  it('ulusal duyuruyu yalnız bakanlık yapar', () => {
    expect(checkTargeting(ulke, { places: [] }).ok).toBe(true);
    expect(checkTargeting(il, { places: [] }).ok).toBe(false);
    expect(checkTargeting(ilce, { places: [] }).ok).toBe(false);
  });
  it('il müdürlüğü kendi ilinin her ilçesine yayınlar, başka ile yayınlayamaz (Türkçe harf duyarsız)', () => {
    expect(checkTargeting(il, { places: [{ province: 'gaziantep', district: 'Nizip' }] }).ok).toBe(
      true,
    );
    expect(checkTargeting(il, { places: [{ province: 'GAZİANTEP' }] }).ok).toBe(true);
    const r = checkTargeting(il, {
      places: [{ province: 'Gaziantep' }, { province: 'Şanlıurfa' }],
    });
    expect(r.ok).toBe(false);
  });
  it('ilçe müdürlüğü yalnız kendi ilçesine; ilin geneline ya da komşu ilçeye yayınlayamaz', () => {
    expect(
      checkTargeting(ilce, { places: [{ province: 'Gaziantep', district: 'Şahinbey' }] }).ok,
    ).toBe(true);
    expect(checkTargeting(ilce, { places: [{ province: 'Gaziantep' }] }).ok).toBe(false);
    expect(
      checkTargeting(ilce, { places: [{ province: 'Gaziantep', district: 'Şehitkamil' }] }).ok,
    ).toBe(false);
  });
  it('çember hedefi ulusal olmayan kapsamda reddedilir', () => {
    const t = { places: [{ province: 'Gaziantep' }], circle: { lat: 37, lon: 37, radiusKm: 30 } };
    expect(checkTargeting(il, t).ok).toBe(false);
    expect(checkTargeting(ulke, t).ok).toBe(true);
  });
  it('varsayılan hedef kendi kapsamı ve her zaman denetimden geçer', () => {
    for (const s of [ulke, il, ilce]) expect(checkTargeting(s, defaultTargeting(s)).ok).toBe(true);
  });
});

describe('uzmana sor yönlendirmesi', () => {
  const e = (userId: string, o: Partial<ExpertCandidate>): ExpertCandidate => ({
    userId,
    institution: 'il_mudurlugu',
    expertise: [],
    openQuestions: 0,
    ...o,
  });
  const experts = [
    e('bakanlik', { institution: 'bakanlik' }),
    e('gaziantep-il', { province: 'Gaziantep' }),
    e('sahinbey', { institution: 'ilce_mudurlugu', province: 'Gaziantep', district: 'Şahinbey' }),
    e('urfa', { province: 'Şanlıurfa' }),
  ];
  it('aynı ilçedeki uzman önce', () => {
    expect(pickExpert({ province: 'Gaziantep', district: 'Şahinbey' }, experts)?.userId).toBe(
      'sahinbey',
    );
  });
  it('ilçede uzman yoksa ildeki, ilde yoksa bakanlık; başka ilin uzmanı asla', () => {
    expect(pickExpert({ province: 'Gaziantep', district: 'Nizip' }, experts)?.userId).toBe(
      'gaziantep-il',
    );
    expect(pickExpert({ province: 'Adana', district: 'Seyhan' }, experts)?.userId).toBe('bakanlik');
    expect(
      pickExpert(
        { province: 'Adana' },
        experts.filter((x) => x.userId !== 'bakanlik'),
      ),
    ).toBeNull();
  });
  it('aynı düzeyde ürün uzmanı ve az işi olan önce', () => {
    const two = [
      e('a', { province: 'Gaziantep', openQuestions: 1 }),
      e('b', { province: 'Gaziantep', openQuestions: 5, expertise: ['antep-fistigi'] }),
      e('c', { province: 'Gaziantep', openQuestions: 0 }),
    ];
    expect(pickExpert({ province: 'Gaziantep', cropId: 'antep-fistigi' }, two)?.userId).toBe('b');
    expect(pickExpert({ province: 'Gaziantep', cropId: 'zeytin' }, two)?.userId).toBe('c');
  });
});
