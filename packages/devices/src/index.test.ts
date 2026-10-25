import { describe, expect, it } from 'vitest';
import {
  adapterFor,
  CKS_PENDING_TEXT,
  CsvManualAdapter,
  FakeCksProvider,
  FakeManufacturerCloud,
  getCksProvider,
  normalizePairingCode,
  PairingCodeAdapter,
  parseReadingsCsv,
  validateRegistration,
} from './index';

describe('CSV ölçüm içe aktarma', () => {
  it('başlık satırı atlanır; yüzde ve oran m³/m³ olur; saat dilimsiz zaman UTC+3 sayılır', () => {
    const r = parseReadingsCsv('zaman,nem\n2026-07-10 06:00,%22\n2026-07-10T09:00:00Z,0.18\n');
    expect(r.errors).toEqual([]);
    expect(r.readings).toHaveLength(2);
    expect(r.readings[0]).toMatchObject({
      at: '2026-07-10T03:00:00.000Z', // 06:00 yerel = 03:00 UTC
      metric: 'soil-moisture',
      value: 0.22,
      unit: 'm3/m3',
    });
    expect(r.readings[1]?.value).toBe(0.18);
  });
  it('noktalı virgül ayraçlı satırda ondalık virgül okunur', () => {
    const r = parseReadingsCsv('2026-07-10 06:00;toprak-sicakligi;21,5');
    expect(r.readings[0]).toMatchObject({ metric: 'soil-temp', value: 21.5, unit: 'C' });
  });
  it('geçersiz satırlar satır numarasıyla bildirilir, geçerliler alınır', () => {
    const r = parseReadingsCsv(
      '2026-07-10 06:00,22\nsaçma,5\n2026-07-10 07:00,abc\n2026-07-10 08:00,x,5\n',
    );
    expect(r.readings).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[2]?.message).toContain('Bilinmeyen metrik');
  });
  it('nem aralık dışı reddedilir (negatif)', () => {
    expect(parseReadingsCsv('2026-07-10 06:00,-3').errors).toHaveLength(1);
  });
  it('BOM ve boş satır sorun çıkarmaz', () => {
    const r = parseReadingsCsv('\uFEFF2026-07-10 06:00,30\n\n');
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0]?.value).toBe(0.3);
  });
  it('adaptör: veri yoksa elle girişe hazır; hepsi hatalıysa ilk hata', async () => {
    const a = new CsvManualAdapter();
    expect(await a.connect({ kind: 'nem-sensoru' })).toMatchObject({ ok: true });
    expect(await a.connect({ kind: 'nem-sensoru', csv: 'bozuk,1' })).toMatchObject({ ok: false });
    const ok = await a.connect({ kind: 'nem-sensoru', csv: '2026-07-10 06:00,20\nbozuk,1' });
    expect(ok.ok && ok.message).toContain('1 satır atlandı');
  });
});

describe('eşleştirme kodu adaptörü', () => {
  it('kodu normalleştirir', () => {
    expect(normalizePairingCode(' ab-12 cd ')).toBe('AB-12CD');
  });
  it('geçerli kod kabul, kısa kod ret', async () => {
    const a = new PairingCodeAdapter();
    expect(await a.connect({ kind: 'sulama', pairingCode: 'ab-1234' })).toMatchObject({
      ok: true,
      externalId: 'AB-1234',
    });
    expect(await a.connect({ kind: 'sulama', pairingCode: 'x' })).toMatchObject({ ok: false });
  });
});

describe('üretici bulutu: anahtar yoksa sahte sağlayıcı', () => {
  it('adapterFor her zaman sahte döner (gerçek sağlayıcı kaydı yok); gerçek çağrı yapılmaz', async () => {
    const a = adapterFor('uretici-bulutu', { SOME_KEY: 'x' }, 'bilinmeyen-uretici');
    expect(a.info.fake).toBe(true);
    const r = await a.connect({ kind: 'hava-istasyonu', pairingCode: 'HESAP-123' });
    expect(r.ok && r.message).toContain('gerçek üretici bağlantısı değil');
  });
  it('sahte ölçüm belirlenimlidir ve 0,18-0,32 m³/m³ aralığındadır', async () => {
    const now = new Date('2026-07-10T06:00:00Z');
    const f = new FakeManufacturerCloud(() => now);
    const a = await f.readLatest('abc');
    const b = await f.readLatest('abc');
    expect(a).toEqual(b);
    expect(a[0]?.value).toBeGreaterThanOrEqual(0.18);
    expect(a[0]?.value).toBeLessThanOrEqual(0.32);
  });
  it('yöntemlere göre doğru adaptör', () => {
    expect(adapterFor('eslestirme-kodu').info.id).toBe('esp32-mqtt');
    expect(adapterFor('csv-elle').info.id).toBe('csv-elle');
  });
  it('anahtar gerektiren adaptör, anahtar ortamda yok iken seçilmez (sunucu anahtarı kuralı)', () => {
    // Her adaptörün künyesi: sahte olanlar anahtar istemez; gerçek anahtar yalnız env'den okunur.
    const info = new FakeManufacturerCloud().info;
    expect(info.requiresServerKey).toBe(false);
    expect(info.fake).toBe(true);
  });
});

describe('kayıt doğrulama', () => {
  const base = {
    fieldId: '3f2b8f0e-6f3c-4a4e-9a1b-0c2d3e4f5a6b',
    name: 'Cihaz',
  } as const;
  it('tür-yöntem uyumu: drone için eşleştirme kodu yok', () => {
    expect(
      validateRegistration({
        ...base,
        kind: 'drone',
        method: 'eslestirme-kodu',
        pairingCode: 'ABC-123',
      }),
    ).toMatchObject({ ok: false });
    expect(validateRegistration({ ...base, kind: 'drone', method: 'uretici-bulutu' })).toEqual({
      ok: true,
    });
  });
  it('eşleştirme kodu yöntemi geçerli kod ister', () => {
    expect(
      validateRegistration({ ...base, kind: 'sulama', method: 'eslestirme-kodu' }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      validateRegistration({
        ...base,
        kind: 'sulama',
        method: 'eslestirme-kodu',
        pairingCode: 'AB-1234',
      }),
    ).toEqual({ ok: true });
  });
});

describe('ÇKS hazırlığı', () => {
  it('gerçek çağrı yok: durum "izin-bekleniyor", live false, dürüst metin, parsel uydurulmaz', async () => {
    const p = getCksProvider();
    expect(p).toBeInstanceOf(FakeCksProvider);
    expect(p.fake).toBe(true);
    const s = await p.status();
    expect(s).toEqual({ state: 'izin-bekleniyor', message: CKS_PENDING_TEXT, live: false });
    expect(CKS_PENDING_TEXT).toBe('Resmi bağlantı onaylandığında açılır.');
    expect(await p.listParcels()).toEqual([]);
  });
});
