import type { CommandCreate, CommandDto, DeviceStatusDto, FieldCreate } from '@tarim/schemas';

/** Sunucu yanıt verdi ama hata döndü (400/403/404/429...). Yeniden denemek işe yaramaz. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Sunucuya ulaşılamadı (internet yok / zaman aşımı). Sıraya alınıp sonra denenir. */
export class NetworkError extends Error {
  constructor() {
    super('Sunucuya ulaşılamadı');
    this.name = 'NetworkError';
  }
}

export interface PusulaSourceDto {
  title: string;
  publisher?: string;
  date: string;
  version?: string;
  page?: number;
  needsBadge: boolean;
}

/** Pusula AI kısa kartı: başlık, 1-3 adım, kaynak, "Neden?". */
export interface PusulaCardDto {
  kind: 'answer' | 'refusal' | 'handoff' | 'info';
  title: string;
  steps: string[];
  sources: PusulaSourceDto[];
  why: string;
  expertQuestionId?: string;
  reason?: string;
}

export interface FieldDto {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  village: string | null;
  lat: number | null;
  lon: number | null;
  areaDecare: number | null;
  cropId: string | null;
  locationSource: string | null;
  clientId: string | null;
}

export interface DeviceDto {
  id: string;
  fieldId: string;
  name: string;
  kind: string;
}

export interface CropDto {
  id: string;
  nameTr: string;
  group: string;
  commonRank: number | null;
  needsBadge: boolean;
  canDriveAdvice: boolean;
}

export interface DailyDto {
  date: string;
  tMinC: number;
  tMaxC: number;
  precipMm: number | null;
}

export type FrostAssessmentDto =
  | {
      kind: 'frost';
      probability: number;
      members: number;
      level: 'none' | 'watch' | 'warning';
      thresholdC: number;
      medianMinC: number;
      minMemberC: number;
    }
  | { kind: 'none'; reason: 'uzman-onayi-bekliyor' | 'deger-yok'; badge: boolean };

export type WaterNeedDto =
  | { kind: 'water-need'; etcMmPerDay: number; kc: number; source?: string }
  | { kind: 'none'; reason: 'uzman-onayi-bekliyor' | 'deger-yok'; badge: boolean };

export interface AnnouncementDto {
  id: string;
  sourceOrg: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  publishedAt: string;
  needsBadge: boolean;
  why: string;
}

export interface TodayDto {
  fieldId: string;
  fieldName: string;
  generatedAt: string;
  weather: {
    source: string;
    fetchedAt: string;
    stale: boolean;
    elevationM: number;
    current: { tempC: number; weatherCode: number } | null;
    today: DailyDto;
  };
  et0: { mmPerDay: number; method: string };
  waterNeed: WaterNeedDto;
  frost: {
    assessment: FrostAssessmentDto;
    date: string | null;
    dayOffset: number | null;
    stageName: string | null;
    unavailable: boolean;
    source: string;
    fetchedAt: string;
  };
}

export interface PlaceDto {
  name: string;
  lat: number;
  lon: number;
}

export interface ProposalDto {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  as: 'owner' | 'helper';
  payload: FieldCreate;
  createdAt: string;
}

export interface MarketSourceDto {
  name: string;
  date: string;
  version: string;
  url?: string;
}

export interface MarketTrendDto {
  direction: 'up' | 'down' | 'flat' | 'unknown';
  changePct30d: number | null;
  days: number;
}

export interface MarketNetDto {
  kind: 'range' | 'insufficient';
  p10: number | null;
  p50: number | null;
  p90: number | null;
  samples: number;
  assumptions: string[];
}

export interface MarketPlaceDto {
  placeId: string;
  name: string;
  product: string;
  price: number;
  priceMin: number;
  priceMax: number;
  date: string;
  stale: boolean;
  distanceKm: number | null;
  approxLocation: boolean;
  source: MarketSourceDto;
  trend: MarketTrendDto;
  net: MarketNetDto;
}

export interface MarketDto {
  cropId: string;
  cropName: string;
  current: MarketPlaceDto | null;
  places: MarketPlaceDto[];
  national: MarketPlaceDto[];
}

export interface ApiOptions {
  baseUrl: string | (() => Promise<string> | string);
  getToken: () => Promise<string | null> | string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createApi(opts: ApiOptions) {
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken();
    const baseUrl = typeof opts.baseUrl === 'function' ? await opts.baseUrl() : opts.baseUrl;
    const ctrl = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000) : null;
    let res: Response;
    try {
      res = await doFetch(baseUrl + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const msg = (data as { message?: string | string[] } | undefined)?.message;
      throw new ApiError(res.status, Array.isArray(msg) ? msg.join('; ') : (msg ?? 'Hata'));
    }
    return data as T;
  }

  const q = encodeURIComponent;
  return {
    requestOtp: (phone: string) => request<{ ok: boolean }>('POST', '/auth/otp/request', { phone }),
    verifyOtp: (phone: string, code: string) =>
      request<{ token: string; userId: string }>('POST', '/auth/otp/verify', { phone, code }),
    provinces: () => request<string[]>('GET', '/places/provinces'),
    districts: (province: string) =>
      request<string[]>('GET', `/places/districts?province=${q(province)}`),
    villages: (province: string, district: string, search?: string) =>
      request<PlaceDto[]>(
        'GET',
        `/places/villages?province=${q(province)}&district=${q(district)}${search ? `&q=${q(search)}` : ''}`,
      ),
    marketCrops: () => request<{ id: string; name: string }[]>('GET', '/market/crops'),
    marketPrices: (cropId: string, fieldId?: string) =>
      request<MarketDto>(
        'GET',
        `/market/prices?crop=${q(cropId)}${fieldId ? `&fieldId=${q(fieldId)}` : ''}`,
      ),
    today: (fieldId: string) => request<TodayDto>('GET', `/fields/${q(fieldId)}/today`),
    announcements: (fieldId: string) =>
      request<{ announcements: AnnouncementDto[] }>('GET', `/fields/${q(fieldId)}/announcements`),
    registerPush: (token: string, platform: 'ios' | 'android' | 'web') =>
      request<{ ok: boolean }>('POST', '/me/push-token', { token, platform }),
    crops: () => request<CropDto[]>('GET', '/crops'),
    devices: () => request<DeviceDto[]>('GET', '/devices'),
    deviceStatus: (id: string) => request<DeviceStatusDto>('GET', `/devices/${q(id)}/status`),
    /** Sulama komutu ASLA çevrimdışı sıraya alınmaz: geç icra edilen vana komutu tehlikelidir. */
    sendCommand: (id: string, body: CommandCreate) =>
      request<CommandDto>('POST', `/devices/${q(id)}/commands`, body),
    fields: () => request<FieldDto[]>('GET', '/fields'),
    createField: (f: FieldCreate) => request<FieldDto>('POST', '/fields', f),
    pusulaAsk: (body: {
      question: string;
      fieldId?: string;
      image?: { mime: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };
    }) => request<{ card: PusulaCardDto }>('POST', '/pusula/ask', body),
    nearbyCreateCode: () => request<{ code: string; expiresAt: string }>('POST', '/nearby/codes'),
    nearbyClaim: (code: string, field: FieldCreate) =>
      request<{ proposalId: string }>('POST', '/nearby/claim', { code, field }),
    nearbyProposals: () => request<ProposalDto[]>('GET', '/nearby/proposals'),
    nearbyDecide: (id: string, approve: boolean) =>
      request<{ status: string }>('POST', `/nearby/proposals/${id}/decision`, { approve }),
  };
}

export type Api = ReturnType<typeof createApi>;
