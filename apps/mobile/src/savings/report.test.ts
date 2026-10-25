import { describe, expect, it } from 'vitest';
import type { SavingsDto, SavingsReportDto } from '../api/client';
import { reportHtml, reportText, savingsView } from './report';

const report: SavingsReportDto = {
  kind: 'report',
  days: 30,
  areaDecare: 10,
  traditionalMm: 240,
  pusulaMm: 100,
  traditionalM3: 2400,
  pusulaM3: 1000,
  savedM3: 1400,
  savedPct: 58.3,
  traditionalBasis: 'beyan',
  pusulaBasis: 'hesap',
  isEstimate: true,
  pusulaStressDays: 0,
  traditionalStressDays: 0,
  traditionalDeepPercolationMm: 90,
  pusulaDeepPercolationMm: 0,
  irrigationsPusula: 2,
  irrigationsTraditional: 6,
  assumptions: [
    'Hacim = derinlik (mm) × alan (dekar); 1 mm × 1000 m² = 1 m³.',
    'Uygulama verimi hesaba katılmadı <net su>.',
  ],
};

const dto = (result: SavingsDto['result']): SavingsDto => ({
  fieldId: 'f1',
  fieldName: 'Kiraz "Bahçesi" & Ortağı',
  generatedAt: '2026-10-25T08:00:00Z',
  period: { from: '2026-09-25', to: '2026-10-24', days: 30 },
  method: 'FAO-56 su dengesi',
  sources: {
    weather: { name: 'Open-Meteo', date: '2026-10-25', version: 'günlük' },
    kc: { name: 'FAO-56', date: '2026-01-01', version: 'paket v1' },
    soil: { name: 'FAO-56 Tablo 19', date: '2026-10-19', version: 'taslak-2026-10-19' },
    waterParams: null,
  },
  singleKcNote: 'Dönem boyunca tek Kc kullanıldı.',
  result,
});

describe('tasarruf raporu metni', () => {
  const v = savingsView(dto(report));
  it('başlık ve satırlar m³ ve % verir', () => {
    expect(v.kind).toBe('report');
    if (v.kind !== 'report') return;
    expect(v.headline).toBe('1.400 m³ (%58,3) daha az su');
    expect(v.rows.find((r) => r.label.startsWith('Geleneksel'))?.value).toBe('2.400 m³ (240 mm)');
    expect(v.rows.find((r) => r.label.startsWith('Tarım Pusula'))?.value).toBe('1.000 m³ (100 mm)');
  });
  it('taban çizgisi türü satır etiketinde yazılır; tahmin uyarısı var', () => {
    if (v.kind !== 'report') throw new Error();
    expect(v.rows.some((r) => r.label.includes('çiftçi beyanı'))).toBe(true);
    expect(v.rows.some((r) => r.label.includes('hesap (FAO-56)'))).toBe(true);
    expect(v.estimateNote).toContain('TAHMİN');
  });
  it('ölçülü ise tahmin notu yok; stres günü varsa uyarı', () => {
    const measured = savingsView(
      dto({
        ...report,
        isEstimate: false,
        pusulaBasis: 'olculen',
        traditionalBasis: 'olculen',
        pusulaStressDays: 3,
      }),
    );
    if (measured.kind !== 'report') throw new Error();
    expect(measured.estimateNote).toBeNull();
    expect(measured.stressNote).toContain('3 gün');
  });
  it('Pusula daha fazla su kullanmışsa "daha fazla su" der (kazanç uydurulmaz)', () => {
    const worse = savingsView(dto({ ...report, savedM3: -200, savedPct: -8.3 }));
    expect(worse.kind === 'report' && worse.headline).toBe('200 m³ (%8,3) daha fazla su');
  });
  it('onaysız veri: rakam yok, dürüst mesaj', () => {
    const none = savingsView(
      dto({ kind: 'none', reason: 'uzman-onayi-bekliyor', missing: ['Kc'] }),
    );
    expect(none.kind).toBe('none');
    expect(none.kind === 'none' && none.message).toContain('rakam uydurmuyoruz');
    expect(JSON.stringify(none)).not.toMatch(/onayı bekl/i);
  });
});

describe('paylaşım çıktısı', () => {
  it('düz metin: kaynak + tarih + sürüm, varsayımlar, yöntem', () => {
    const t = reportText(dto(report), '0.1.0');
    expect(t).toContain('Üretim: 2026-10-25 · uygulama sürümü 0.1.0');
    expect(t).toContain('Open-Meteo · 2026-10-25 · günlük');
    expect(t).toContain('FAO-56 Tablo 19 · 2026-10-19 · taslak-2026-10-19');
    expect(t).toContain('Taban çizgisi ve varsayımlar:');
    expect(t).toContain('1 mm × 1000 m² = 1 m³');
  });
  it('HTML: özel karakterler kaçırılır, tablo ve kaynak listesi var', () => {
    const h = reportHtml(dto(report), '0.1.0');
    expect(h).toContain('Kiraz &quot;Bahçesi&quot; &amp; Ortağı');
    expect(h).toContain('Uygulama verimi hesaba katılmadı &lt;net su&gt;.');
    expect(h).not.toContain('<net su>');
    expect(h).toContain('<table>');
    expect(h).toContain('Kaynaklar');
    expect(h).toContain('lang="tr"');
  });
  it('rapor yokken de çıktı üretilir ve mesaj içerir', () => {
    const none = dto({ kind: 'none', reason: 'deger-yok', missing: ['alan'] });
    expect(reportText(none, '1')).toContain('eksik bilgi var: alan');
    expect(reportHtml(none, '1')).toContain('eksik bilgi var: alan');
  });
});
