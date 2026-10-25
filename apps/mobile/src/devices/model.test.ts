import { describe, expect, it } from 'vitest';
import type { DeviceDto } from '../api/client';
import { hubCards } from '../hub/model';
import {
  buildRegisterBody,
  deviceLines,
  fieldDevices,
  KIND_METHODS,
  latestMoistureText,
  moistureBars,
  moisturePoints,
  type RegisterForm,
} from './model';

const dev = (over: Partial<DeviceDto>): DeviceDto => ({
  id: 'd1',
  fieldId: 'f1',
  name: 'Vana',
  kind: 'sulama',
  ...over,
});

const form = (over: Partial<RegisterForm> = {}): RegisterForm => ({
  fieldId: 'f1',
  name: 'Vana 1',
  kind: 'sulama',
  method: 'eslestirme-kodu',
  manufacturer: '',
  model: '',
  pairingCode: 'AB-1234',
  ...over,
});

describe('sayfa kendiliğinden gelişir (cihaz ekle / çıkar ile kartlar)', () => {
  const keys = (devices: DeviceDto[]) =>
    hubCards(fieldDevices(devices, 'f1').capabilities).map((c) => c.key);

  it('hiç cihaz yokken yalnız ana sayfa içerikleri: sulama, nem, drone kartı YOK', () => {
    const k = keys([]);
    expect(k).not.toContain('sulama');
    expect(k).not.toContain('nem');
    expect(k).not.toContain('drone');
    expect(k).toContain('plan');
    expect(k).toContain('takvim');
  });
  it('sulama cihazı eklenince Sulama kartı açılır, çıkarılınca kapanır', () => {
    expect(keys([dev({})])).toContain('sulama');
    expect(keys([])).not.toContain('sulama');
  });
  it('sensör eklenince Nem kartı ve nem hatırlatıcısı kartı açılır', () => {
    const k = keys([dev({ kind: 'nem-sensoru' })]);
    expect(k).toContain('nem');
    expect(k).toContain('nem-hatirlatici');
  });
  it('drone eklenince Verim Haritası / NDVI görev kartı açılır', () => {
    expect(keys([dev({ kind: 'drone' })])).toContain('drone');
  });
  it('başka arazinin cihazı bu arazinin kartını açmaz', () => {
    expect(keys([dev({ fieldId: 'f2' })])).not.toContain('sulama');
  });
  it('kartlar yinelenmez', () => {
    const k = keys([dev({ kind: 'nem-sensoru' }), dev({ id: 'd2', kind: 'sulama' })]);
    expect(new Set(k).size).toBe(k.length);
  });
});

describe('cihaz ekleme formu', () => {
  it('geçerli form kayıt gövdesine çevrilir', () => {
    const r = buildRegisterBody(form({ manufacturer: 'Üretici', model: 'M1' }));
    expect(r.ok && r.body).toMatchObject({
      fieldId: 'f1',
      kind: 'sulama',
      method: 'eslestirme-kodu',
      manufacturer: 'Üretici',
      model: 'M1',
      pairingCode: 'AB-1234',
    });
  });
  it('eksik alanlar dürüst mesaj verir', () => {
    expect(buildRegisterBody(form({ fieldId: undefined }))).toMatchObject({ ok: false });
    expect(buildRegisterBody(form({ kind: null }))).toMatchObject({ ok: false });
    expect(buildRegisterBody(form({ method: null }))).toMatchObject({ ok: false });
    expect(buildRegisterBody(form({ name: '  ' }))).toMatchObject({ ok: false });
  });
  it('tür ve yöntem uyumsuzluğu reddedilir; eşleştirme kodu gerekir', () => {
    expect(buildRegisterBody(form({ kind: 'drone', method: 'eslestirme-kodu' }))).toMatchObject({
      ok: false,
    });
    expect(buildRegisterBody(form({ pairingCode: '' }))).toMatchObject({ ok: false });
    expect(
      buildRegisterBody(form({ kind: 'drone', method: 'uretici-bulutu', pairingCode: '' })),
    ).toMatchObject({ ok: true });
  });
  it('her tür için en az bir yöntem sunulur', () => {
    for (const k of Object.keys(KIND_METHODS))
      expect(KIND_METHODS[k as keyof typeof KIND_METHODS].length).toBeGreaterThan(0);
  });
  it('kart satırlarında künye görünür (tür, üretici model, kaynak, sürüm, tarih)', () => {
    const lines = deviceLines(
      dev({
        manufacturer: 'Üretici',
        model: 'M1',
        connectionMethod: 'uretici-bulutu',
        source: 'ornek-bulut',
        adapterVersion: '1.0.0',
        createdAt: '2026-10-25T08:00:00Z',
      }),
    ).join(' | ');
    expect(lines).toContain('Üretici M1');
    expect(lines).toContain('Kaynak: ornek-bulut (sürüm 1.0.0)');
    expect(lines).toContain('Eklenme: 2026-10-25');
  });
});

describe('nem grafiği', () => {
  const r = {
    readings: [
      { at: '2026-10-25T06:00:00Z', value: 0.215, unit: 'm3/m3' },
      { at: '2026-10-25T08:00:00Z', value: 0.19, unit: 'm3/m3' },
    ],
  };
  it('oran yüzdeye çevrilir (0,215 → %21,5)', () => {
    expect(moisturePoints(r).map((p) => p.pct)).toEqual([21.5, 19]);
  });
  it('çubuk yüksekliği yüzde/50, 0..1 kırpılır', () => {
    const b = moistureBars([
      { at: 'x', pct: 25 },
      { at: 'y', pct: 80 },
      { at: 'z', pct: 0 },
    ]);
    expect(b.map((x) => x.height)).toEqual([0.5, 1, 0]);
  });
  it('son ölçüm metni: saat önce / dk önce; veri yoksa null', () => {
    const pts = moisturePoints(r);
    expect(latestMoistureText(pts, new Date('2026-10-25T10:00:00Z'))).toBe('%19 · 2 saat önce');
    expect(latestMoistureText(pts, new Date('2026-10-25T08:20:00Z'))).toBe('%19 · 20 dk önce');
    expect(latestMoistureText([], new Date())).toBeNull();
  });
});
