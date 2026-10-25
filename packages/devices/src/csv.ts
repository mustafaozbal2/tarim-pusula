import type {
  DeviceAdapter,
  ConnectRequest,
  ConnectResult,
  DeviceReading,
  AdapterInfo,
} from './types';

/**
 * CSV / elle giriş: "zaman,nem" ya da "zaman,metrik,değer" satırları.
 *  - zaman: ISO 8601 (saat dilimi yoksa Türkiye saati UTC+3 sayılır).
 *  - nem: yüzde (0-100, "%" olabilir) ya da oran (0-1); ikisi de m³/m³'e çevrilir.
 * Geçersiz satırlar atlanır ve hata listesinde satır numarasıyla bildirilir.
 */
export interface CsvParseResult {
  readings: DeviceReading[];
  errors: { line: number; message: string }[];
}

const METRICS: Record<string, DeviceReading['metric']> = {
  nem: 'soil-moisture',
  'toprak-nemi': 'soil-moisture',
  'toprak-sicakligi': 'soil-temp',
  sicaklik: 'air-temp',
  yagis: 'rain',
  sayac: 'flow-m3',
};
const UNITS: Record<DeviceReading['metric'], DeviceReading['unit']> = {
  'soil-moisture': 'm3/m3',
  'soil-temp': 'C',
  'air-temp': 'C',
  rain: 'mm',
  'flow-m3': 'm3',
};

function parseTime(s: string): string | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(t))
    return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(t);
  const withTime = t.length === 10 ? `${t}T00:00:00` : t.replace(' ', 'T');
  const full = /T\d{2}:\d{2}$/.test(withTime) ? `${withTime}:00` : withTime;
  const ms = Date.parse(hasZone ? full : `${full}+03:00`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function parseNumber(s: string): number | null {
  const t = s.trim().replace('%', '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function parseReadingsCsv(text: string): CsvParseResult {
  const readings: DeviceReading[] = [];
  const errors: CsvParseResult['errors'] = [];
  text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((raw, idx) => {
      const line = idx + 1;
      const row = raw.trim();
      if (!row) return;
      // Ayraç ';' ise ondalık virgül kullanılabilir ("21,5"); aksi halde ayraç virgüldür.
      const parts = (row.includes(';') ? row.split(';') : row.split(',')).map((c) => c.trim());
      if (idx === 0 && !/^\d/.test(parts[0] ?? '')) return; // başlık satırı
      const at = parseTime(parts[0] ?? '');
      if (!at) return void errors.push({ line, message: 'Zaman geçersiz (YYYY-AA-GG SS:DD)' });
      let metric: DeviceReading['metric'] = 'soil-moisture';
      let rawValue = parts[1] ?? '';
      if (parts.length >= 3) {
        const m = METRICS[(parts[1] ?? '').toLocaleLowerCase('tr-TR')];
        if (!m) return void errors.push({ line, message: `Bilinmeyen metrik: ${parts[1] ?? ''}` });
        metric = m;
        rawValue = parts[2] ?? '';
      }
      let value = parseNumber(rawValue);
      if (value === null) return void errors.push({ line, message: 'Değer sayı olmalı' });
      if (metric === 'soil-moisture') {
        if (value > 1) value /= 100; // yüzde -> oran
        if (value < 0 || value > 1) {
          return void errors.push({ line, message: 'Nem 0-100 yüzde arasında olmalı' });
        }
      }
      readings.push({
        at,
        metric,
        value: Math.round(value * 10_000) / 10_000,
        unit: UNITS[metric],
      });
    });
  return { readings, errors };
}

const INFO: AdapterInfo = {
  id: 'csv-elle',
  label: 'CSV dosyası / elle giriş',
  method: 'csv-elle',
  kinds: ['nem-sensoru', 'hava-istasyonu', 'drone', 'ilaclama', 'diger'],
  version: '1.0.0',
  fake: false,
  requiresServerKey: false,
  licenseNote: 'Kullanıcının kendi verisi; üçüncü taraf lisansı yok.',
};

export class CsvManualAdapter implements DeviceAdapter {
  readonly info = INFO;
  async connect(req: ConnectRequest): Promise<ConnectResult> {
    if (!req.csv?.trim())
      return { ok: true, externalId: null, readings: [], message: 'Elle girişe hazır.' };
    const { readings, errors } = parseReadingsCsv(req.csv);
    if (readings.length === 0) {
      return {
        ok: false,
        reason: errors[0] ? `Satır ${errors[0].line}: ${errors[0].message}` : 'Veri yok',
      };
    }
    const note = errors.length > 0 ? ` ${errors.length} satır atlandı.` : '';
    return {
      ok: true,
      externalId: null,
      readings,
      message: `${readings.length} ölçüm alındı.${note}`,
    };
  }
  async readLatest(): Promise<DeviceReading[]> {
    return [];
  }
}
