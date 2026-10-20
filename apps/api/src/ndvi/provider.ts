import { parseStatisticalResponse, type NdviPoint } from '@tarim/agro-core';
import type { Boundary } from '@tarim/schemas';

/**
 * Sentinel-2 L2A NDVI zaman serisi sağlayıcıları.
 * Gerçek: Copernicus Data Space Statistical API (OAuth istemci kimliği gerekir, .env).
 * Anahtar yoksa: ağa çıkmayan sahte sağlayıcı (testler, geliştirme); verisi AÇIKÇA "örnek" işaretlidir.
 */
export interface NdviResult {
  points: NdviPoint[];
  /** Kaynak adı (kartta gösterilir). */
  source: string;
  /** Veri sürümü / biçim kimliği. */
  version: string;
  /** Gerçek uydu verisi değil, üretilmiş örnek. */
  sample: boolean;
}

export interface NdviProvider {
  /** from/to: YYYY-MM-DD (to dışlayıcı). */
  series(boundary: Boundary, from: string, to: string): Promise<NdviResult>;
}

export class NdviUnavailableError extends Error {
  constructor(detail: string) {
    super(`NDVI alınamadı: ${detail}`);
    this.name = 'NdviUnavailableError';
  }
}

export const NDVI_SOURCE = 'Copernicus Sentinel-2 L2A (Copernicus Data Space, Statistical API)';
export const AGGREGATION = 'P7D';

/**
 * B04 (kırmızı) ve B08 (yakın kızılötesi) ile NDVI; yalnız bitki (SCL 4) ve çıplak toprak (SCL 5)
 * pikselleri sayılır, bulut/gölge/kar/su elenir. Elenen piksel noDataCount'a düşer.
 */
export const NDVI_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  var sum = s.B08 + s.B04;
  var ok = s.dataMask === 1 && (s.SCL === 4 || s.SCL === 5) && sum > 0;
  return { ndvi: [ok ? (s.B08 - s.B04) / sum : 0], dataMask: [ok ? 1 : 0] };
}`;

export interface CopernicusOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  tokenUrl?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const API_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics';

export class CopernicusNdviClient implements NdviProvider {
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private tokenCache: { value: string; expiresAt: number } | null = null;

  constructor(private readonly opts: CopernicusOptions) {
    this.doFetch = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30_000);
    try {
      return await this.doFetch(url, { ...init, signal: ctrl.signal });
    } catch {
      throw new NdviUnavailableError('sunucuya ulaşılamadı');
    } finally {
      clearTimeout(timer);
    }
  }

  private async token(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > this.now()) return this.tokenCache.value;
    const res = await this.send(this.opts.tokenUrl ?? TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      }).toString(),
    });
    if (!res.ok) throw new NdviUnavailableError(`kimlik doğrulama reddedildi (${res.status})`);
    const j = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (!j || typeof j.access_token !== 'string') throw new NdviUnavailableError('jeton yok');
    const ttl = typeof j.expires_in === 'number' ? j.expires_in : 300;
    // Bitimine 30 sn kala yenile.
    this.tokenCache = { value: j.access_token, expiresAt: this.now() + (ttl - 30) * 1000 };
    return j.access_token;
  }

  /** İstek gövdesi (testte denetlenir). Çözünürlük derece cinsindendir: 0,0001° ≈ 10 m. */
  requestBody(boundary: Boundary, from: string, to: string) {
    return {
      input: {
        bounds: {
          geometry: boundary,
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
        },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }],
      },
      aggregation: {
        timeRange: { from: `${from}T00:00:00Z`, to: `${to}T00:00:00Z` },
        aggregationInterval: { of: AGGREGATION },
        lastIntervalBehavior: 'SHORTEN',
        evalscript: NDVI_EVALSCRIPT,
        resolution: { x: 0.0001, y: 0.0001 },
      },
    };
  }

  async series(boundary: Boundary, from: string, to: string): Promise<NdviResult> {
    const token = await this.token();
    const res = await this.send(this.opts.apiUrl ?? API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(this.requestBody(boundary, from, to)),
    });
    if (res.status === 401) this.tokenCache = null;
    if (!res.ok) throw new NdviUnavailableError(`istek reddedildi (${res.status})`);
    const body = await res.json().catch(() => null);
    if (!body) throw new NdviUnavailableError('yanıt okunamadı');
    return {
      points: parseStatisticalResponse(body),
      source: NDVI_SOURCE,
      version: `statistical-v1@${new Date(this.now()).toISOString().slice(0, 10)}`,
      sample: false,
    };
  }
}

/** Haftalık örnek seri: bahar-yaz tepeli mevsim eğrisi. Gerçek uydu verisi DEĞİLDİR. */
export class FakeNdviProvider implements NdviProvider {
  calls = 0;
  constructor(
    private readonly make?: (from: string, to: string) => NdviPoint[],
    private readonly fail = false,
  ) {}

  async series(_b: Boundary, from: string, to: string): Promise<NdviResult> {
    this.calls++;
    if (this.fail) throw new NdviUnavailableError('örnek hata');
    return {
      points: this.make ? this.make(from, to) : sampleNdvi(from, to),
      source: 'Örnek veri (gerçek uydu verisi değil)',
      version: 'ornek-v1',
      sample: true,
    };
  }
}

const DAY = 86_400_000;

/** Belirlenimli örnek: 0,25 + 0,45·sin(π·t) mevsim eğrisi, her 5. aralık bulutlu. */
export function sampleNdvi(from: string, to: string): NdviPoint[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const out: NdviPoint[] = [];
  const n = Math.max(1, Math.floor((end - start) / (7 * DAY)));
  for (let i = 0; i < n; i++) {
    const a = start + i * 7 * DAY;
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const mean = 0.25 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push({
      from: iso(a),
      to: iso(Math.min(a + 7 * DAY, end)),
      mean: Math.round(mean * 1000) / 1000,
      min: Math.max(-1, mean - 0.2),
      max: Math.min(1, mean + 0.2),
      stDev: 0.07,
      validFraction: i % 5 === 4 ? 0.2 : 0.95,
    });
  }
  return out;
}
