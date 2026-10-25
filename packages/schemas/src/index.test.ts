import { describe, expect, it } from 'vitest';
import {
  canOpen,
  PANEL_MENU,
  hasPanelAccess,
  kcRecordSchema,
  panelMenu,
  sourceRefSchema,
  stageCreateSchema,
} from './index';

describe('şemalar', () => {
  const source = {
    source: 'FAO-56 Table 12',
    retrievedAt: '2026-10-19T00:00:00Z',
    version: '1998',
  };
  it('kaynak kaydı üç alanı da ister', () => {
    expect(sourceRefSchema.safeParse(source).success).toBe(true);
    expect(sourceRefSchema.safeParse({ source: 'x' }).success).toBe(false);
  });
  it('geçersiz onay durumunu reddeder', () => {
    const base = {
      cropTr: 'Arpa',
      cropFao: 'Barley',
      kcIni: 0.3,
      kcMid: 1.15,
      kcEnd: 0.25,
      source,
    };
    expect(
      kcRecordSchema.safeParse({ ...base, reviewStatus: 'taslak-uzman-onayi-bekliyor' }).success,
    ).toBe(true);
    expect(kcRecordSchema.safeParse({ ...base, reviewStatus: 'belki' }).success).toBe(false);
  });
});

import { phoneSchema, otpVerifySchema, fieldCreateSchema } from './index';

describe('telefon ve kimlik şemaları', () => {
  it.each(['0532 123 45 67', '5321234567', '905321234567', '+90 (532) 123-45-67'])(
    '%s normalize edilir',
    (v) => expect(phoneSchema.parse(v)).toBe('+905321234567'),
  );
  it.each(['', '12345', '+905', '02121234567', '+15551234567', '12345678901'])(
    '%s reddedilir (TC kimlik no gibi 11 haneli değerler dahil)',
    (v) => expect(phoneSchema.safeParse(v).success).toBe(false),
  );
  it('OTP kodu 6 hane olmalı', () => {
    expect(otpVerifySchema.safeParse({ phone: '5321234567', code: '12345' }).success).toBe(false);
    expect(otpVerifySchema.safeParse({ phone: '5321234567', code: '123456' }).success).toBe(true);
  });
  it('tarla koordinatı sınırları denetlenir', () => {
    expect(fieldCreateSchema.safeParse({ name: 'A', lat: 91, lon: 38 }).success).toBe(false);
    expect(fieldCreateSchema.safeParse({ name: 'A' }).success).toBe(false); // nokta konum zorunlu
    expect(fieldCreateSchema.safeParse({ name: 'A', lat: 37, lon: 38 }).success).toBe(true);
  });
});

import { boundarySchema, nearbyCodeSchema, nearbyClaimSchema } from './index';

describe('tarla sınırı ve yakın kodu', () => {
  const ring = [
    [37, 37],
    [37.001, 37],
    [37.001, 37.001],
    [37, 37],
  ];
  it('sınır GeoJSON Polygon olmalı', () => {
    expect(boundarySchema.safeParse({ type: 'Polygon', coordinates: [ring] }).success).toBe(true);
    expect(
      boundarySchema.safeParse({ type: 'Polygon', coordinates: [ring.slice(0, 3)] }).success,
    ).toBe(false);
    expect(boundarySchema.safeParse({ type: 'Polygon', coordinates: [ring, ring] }).success).toBe(
      false,
    );
    expect(
      boundarySchema.safeParse({ type: 'Polygon', coordinates: [[[200, 0], ...ring]] }).success,
    ).toBe(false);
  });
  it('kod 6 hane; boşluklu yazım kabul', () => {
    expect(nearbyCodeSchema.parse('482 913')).toBe('482913');
    expect(nearbyCodeSchema.safeParse('48291').success).toBe(false);
    expect(nearbyCodeSchema.safeParse('abcdef').success).toBe(false);
  });
  it('talep tarla içerir', () => {
    expect(
      nearbyClaimSchema.safeParse({ code: '482913', field: { name: 'A', lat: 37, lon: 38 } })
        .success,
    ).toBe(true);
  });
});

describe('panel menüsü', () => {
  it('rol bazlı menü ve sayfa erişimi', () => {
    expect(panelMenu(['farmer'])).toEqual([]);
    expect(hasPanelAccess(['farmer', 'assistant'])).toBe(false);
    expect(panelMenu(['institution_admin']).map((m) => m.path)).toEqual([
      '/',
      '/uretim/arz-talep',
      '/uretim/verim',
      '/uretim/urunler',
      '/duyurular',
    ]);
    expect(panelMenu(['expert']).map((m) => m.path)).toEqual([
      '/',
      '/arazi',
      '/uretim/arz-talep',
      '/uretim/verim',
      '/uretim/urunler',
      '/duyurular',
      '/onay',
      '/paketler',
      '/toprak',
      '/uzman',
    ]);
    const admin = panelMenu(['admin']).map((m) => m.path);
    expect(admin).toEqual(expect.arrayContaining(['/denetim', '/cihazlar', '/kullanicilar']));
    // kurum yöneticisi yönetim sayfalarını göremez
    for (const p of [
      '/arazi',
      '/onay',
      '/paketler',
      '/toprak',
      '/uzman',
      '/cihazlar',
      '/denetim',
      '/kullanicilar',
    ])
      expect(canOpen(p, ['institution_admin']), p).toBe(false);
    expect(canOpen('/', ['institution_admin'])).toBe(true);
    expect(canOpen('/cihazlar', ['expert'])).toBe(false);
    expect(canOpen('/kullanicilar', ['expert'])).toBe(false);
    // her öğenin ikonu var; gruplu öğeler aynı grupta ardışık
    expect(PANEL_MENU.every((m) => m.icon)).toBe(true);
    const groups = PANEL_MENU.map((m) => m.group).filter(Boolean);
    expect(new Set(groups)).toEqual(
      new Set(['Arazi işlemleri', 'Üretim planlama', 'Duyuru ve içerik']),
    );
    expect(canOpen('/onay', ['institution_admin'])).toBe(false);
    expect(canOpen('/onay/x', ['expert'])).toBe(true);
    expect(canOpen('/denetim', ['expert'])).toBe(false);
    expect(canOpen('/bilinmeyen', ['admin'])).toBe(false);
    expect(canOpen('/onayx', ['admin'])).toBe(false);
  });

  it('evre girişi: kaynak zorunlu, Kc ya da don eşiği gerekli', () => {
    expect(
      stageCreateSchema.safeParse({ nameTr: 'Çiçeklenme', frostCriticalC: -2, source: 'FAO' })
        .success,
    ).toBe(true);
    expect(
      stageCreateSchema.safeParse({ nameTr: 'Çiçeklenme', frostCriticalC: -2, source: '' }).success,
    ).toBe(false);
    expect(stageCreateSchema.safeParse({ nameTr: 'Çiçeklenme', source: 'FAO' }).success).toBe(
      false,
    );
  });
});

import { capabilitiesFor, deviceRegisterSchema, DEVICE_KINDS, KIND_METHODS } from './devices';

describe('cihaz türleri ve yetenekler (G21)', () => {
  it('cihaz yoksa yetenek yok: yalnız ana sayfa içerikleri', () => {
    expect(capabilitiesFor([])).toEqual([]);
  });
  it('sulama cihazı Sulama kartını, sensör nem grafiği ve hatırlatıcıyı, drone görev kartını açar', () => {
    expect(capabilitiesFor(['sulama'])).toEqual(['sulama-karti']);
    expect(capabilitiesFor(['nem-sensoru'])).toEqual(['nem-grafigi', 'nem-hatirlaticisi']);
    expect(capabilitiesFor(['drone'])).toEqual(['drone-gorevi']);
  });
  it('çıkarılınca yetenek kapanır; yinelenen tür tek sayılır; bilinmeyen tür yok sayılır', () => {
    expect(capabilitiesFor(['sulama', 'sulama', 'bilinmeyen'])).toEqual(['sulama-karti']);
    expect(capabilitiesFor(['drone', 'sulama', 'nem-sensoru'])).toEqual([
      'sulama-karti',
      'nem-grafigi',
      'nem-hatirlaticisi',
      'drone-gorevi',
    ]);
  });
  it('her türün en az bir bağlantı yöntemi var', () => {
    for (const k of DEVICE_KINDS) expect(KIND_METHODS[k].length, k).toBeGreaterThan(0);
  });
  it('cihaz ekleme gövdesi: kod biçimi ve tür doğrulanır', () => {
    const base = {
      fieldId: '3f2b8f0e-6f3c-4a4e-9a1b-0c2d3e4f5a6b',
      name: 'Vana 1',
      kind: 'sulama',
      method: 'eslestirme-kodu',
    };
    expect(deviceRegisterSchema.safeParse({ ...base, pairingCode: 'ABC-123' }).success).toBe(true);
    expect(deviceRegisterSchema.safeParse({ ...base, pairingCode: 'x' }).success).toBe(false);
    expect(deviceRegisterSchema.safeParse({ ...base, kind: 'uzay-gemisi' }).success).toBe(false);
  });
});
