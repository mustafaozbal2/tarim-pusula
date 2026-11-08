import type { CurrentDto } from '../today/weatherView';
import type { WalletDto } from '../wallet/model';
import type {
  CommandCreate,
  CommandDto,
  DeviceRegister,
  DeviceStatusDto,
  FieldCreate,
  FieldUpdate,
} from '@tarim/schemas';

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

/** Demo ana sayfa örnek kaydı: tarih demo gününe `gunFarki` eklenerek bulunur (kesin tarih iddiası yok). */
export interface OrnekSatirDto {
  baslik: string;
  ozet: string;
  gunFarki: number;
}

/** Ürün başına örnek ana sayfa içeriği (yalnız demo sunucusunda vardır; G22). */
export interface OrnekIcerikDto {
  urunId: string;
  urunAdi: string;
  kaynak: string;
  tarih: string;
  surum: string;
  kartlar: { baslik: string; ozet: string; gorsel: string }[];
  faaliyetZamani: OrnekSatirDto[];
  faaliyetRehberi: OrnekSatirDto[];
  erkenUyarilar: OrnekSatirDto[];
  destekler: OrnekSatirDto[];
}

// --- G24 tipleri ---
export type InstitutionKey =
  | 'bakanlik'
  | 'il_mudurlugu'
  | 'ilce_mudurlugu'
  | 'belediye'
  | 'ziraat_odasi'
  | 'kooperatif'
  | 'universite'
  | 'arastirma_enstitusu'
  | 'danismanlik';

export interface StaffRegisterBody {
  phone: string;
  code: string;
  password: string;
  name: string;
  institution: InstitutionKey;
  institutionName: string;
  province?: string;
  district?: string;
  title: string;
  registryNo: string;
  expertise: string[];
  wantsRole: 'expert' | 'institution_admin';
  kvkk: true;
}

export interface StaffProfileDto {
  userId: string;
  institution: InstitutionKey;
  institutionName: string;
  province: string | null;
  district: string | null;
  title: string;
  registryNo: string;
  expertise: string[];
  wantsRole: 'expert' | 'institution_admin';
  status: 'basvuru' | 'onayli' | 'reddedildi';
  decisionNote: string | null;
  createdAt: string;
}

export type ScopeDto =
  | { level: 'ulke' }
  | { level: 'il'; province: string }
  | { level: 'ilce'; province: string; district: string };

export interface StaffMeDto {
  profile: StaffProfileDto | null;
  roles: string[];
  mfa: boolean;
  scope: ScopeDto | null;
  scopeLabel: string | null;
}

export interface StaffAnnouncementDto {
  id: string;
  title: string;
  body: string;
  category: string | null;
  targeting: { places?: { province: string; district?: string }[]; cropIds?: string[] };
  reviewStatus: string;
  publishedAt: string;
  hasImage: boolean;
}

export interface AnnouncementCreateBody {
  sourceOrg: string;
  title: string;
  body: string;
  publishedAt: string;
  category?: 'guncel' | 'bilgilendirme' | 'yonlendirme' | 'onlem' | 'teknoloji';
  imageDataUrl?: string | null;
  targeting: {
    places: { province: string; district?: string }[];
    circle: null;
    cropIds: string[];
  };
}

export interface StaffDraftDto {
  id: string;
  title: string;
  body: string;
  category: string | null;
  sourceOrg: string;
  targeting: { places?: { province: string; district?: string }[]; cropIds?: string[] };
  publishedAt: string;
  hasImage: boolean;
  authorName: string | null;
}

export interface QueueItemDto {
  id: string;
  question: string;
  reason: string;
  hasImage: boolean;
  createdAt: string;
  province: string | null;
  district: string | null;
  cropId: string | null;
  cropName: string | null;
  mine: boolean | null;
}

export interface AnsweredItemDto {
  id: string;
  question: string;
  answer: string;
  answerSource: string;
  answeredAt: string;
  province: string | null;
  district: string | null;
  cropName: string | null;
}

export interface MyQuestionDto {
  id: string;
  question: string;
  status: 'bekliyor' | 'cevaplandi';
  answer: string | null;
  answerSource: string | null;
  answeredAt: string | null;
  createdAt: string;
  hasImage: boolean;
  assigned: boolean;
  /** Uzman cevaplamazsa Nuvia'nın geçici yapay zekâ cevabı (uzman cevabı gelince o esastır). */
  aiAnswer?: string | null;
  aiSource?: string | null;
}

export interface InboxItemDto {
  id: string;
  kind: 'uzman_cevap' | 'duyuru' | 'basvuru';
  title: string;
  body: string;
  refId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface StaffApplicationDto extends StaffProfileDto {
  name: string | null;
  phone: string;
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
  /** Ada / parsel (isteğe bağlı, zorunlu değil). */
  parcelBlock?: string | null;
  parcelNo?: string | null;
  cropId: string | null;
  locationSource: string | null;
  clientId: string | null;
}

export interface DeviceDto {
  id: string;
  fieldId: string;
  name: string;
  kind: string;
  manufacturer?: string | null;
  model?: string | null;
  connectionMethod?: string;
  providerId?: string | null;
  /** Veri kaynağı (adaptör kimliği). */
  source?: string;
  adapterVersion?: string;
  createdAt?: string;
}

export interface ReadingsDto {
  deviceId: string;
  deviceName: string;
  metric: string;
  source: string;
  readings: { at: string; value: number; unit: string }[];
}

export type ReminderDecisionDto =
  | { kind: 'none'; reason: string }
  | {
      kind: 'due';
      type: 'nem-esigi' | 'gunluk-sulama';
      title: string;
      body: string;
      why: string[];
    };

export interface RemindersDto {
  fieldId: string;
  generatedAt: string;
  hasSensor: boolean;
  daily: ReminderDecisionDto;
  moisture: ReminderDecisionDto;
  basis: {
    dailyIsEstimate: boolean;
    note: string;
    windowDays: number;
    sinceIrrigation: string | null;
  } | null;
}

export interface SourceStampDto {
  name: string;
  date: string;
  version: string;
}

export type SavingsReportDto = {
  kind: 'report';
  days: number;
  areaDecare: number;
  traditionalMm: number;
  pusulaMm: number;
  traditionalM3: number;
  pusulaM3: number;
  savedM3: number;
  savedPct: number;
  traditionalBasis: 'olculen' | 'beyan' | 'varsayim';
  pusulaBasis: 'olculen' | 'hesap';
  isEstimate: boolean;
  pusulaStressDays: number;
  traditionalStressDays: number;
  traditionalDeepPercolationMm: number;
  pusulaDeepPercolationMm: number;
  irrigationsPusula: number;
  irrigationsTraditional: number;
  assumptions: string[];
};

export interface SavingsDto {
  fieldId: string;
  fieldName: string;
  generatedAt: string;
  period: { from: string | null; to: string | null; days: number };
  method: string;
  sources: {
    weather: SourceStampDto;
    kc: SourceStampDto | null;
    soil: SourceStampDto | null;
    waterParams: SourceStampDto | null;
  };
  singleKcNote: string;
  result: SavingsReportDto | { kind: 'none'; reason: string; missing: string[] };
}

export interface CropDto {
  id: string;
  nameTr: string;
  group: string;
  commonRank: number | null;
  needsBadge: boolean;
  canDriveAdvice: boolean;
}

export interface KcRowDto {
  id: string;
  nameTr: string;
  group: string;
  kcIni: number | null;
  kcMid: number | null;
  kcEnd: number | null;
  packVersion: number | null;
  source: string | null;
  retrievedAt: string | null;
  needsBadge: boolean;
}

export interface SoilRowDto {
  key: string;
  nameTr: string;
  thetaFc: number;
  thetaWp: number;
  source: string;
  /** Çiftçi dilinde tarif (G23). */
  hint?: string | null;
  needsBadge: boolean;
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
  /** İsteğe bağlı küçük görsel (png/jpeg/webp veri adresi). */
  imageDataUrl?: string | null;
  /** G30: resmi siteden otomatik alındı (uzman onayı yok); özgün sayfa `sourceUrl`. */
  auto?: boolean;
  /** Resmi sitedeki https görsel. */
  imageUrl?: string | null;
}

export interface CalendarEventDto {
  templateId: string;
  title: string;
  detail: string;
  stage: string | null;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  ongoing: boolean;
  needsBadge: boolean;
  actionable: boolean;
  source: string;
  sourceVersion: string;
  sourceDate: string;
  why: string;
}

export interface CalendarDto {
  fieldId: string;
  today: string;
  days: number;
  cropId: string | null;
  events: CalendarEventDto[];
  note: string | null;
}

export interface TodayDto {
  fieldId: string;
  fieldName: string;
  generatedAt: string;
  weather: {
    source: string;
    /** Veri sürümü (API ve model). Eski sunucuda yoktur. */
    version?: string | null;
    /** Örnek veri (gerçek sağlayıcıya ulaşılamadı ya da demo/test). */
    sample?: boolean;
    fetchedAt: string;
    stale: boolean;
    elevationM: number;
    current: CurrentDto | null;
    today: DailyDto;
    /** 5 günlük tahmin. */
    days?: DailyDto[];
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
    /** G30: önümüzdeki 7 gecenin görünümü (eski sunucuda yoktur). */
    outlook?: FrostDayDto[];
  };
}

export interface FrostDayDto {
  date: string;
  dayOffset: number;
  probability: number | null;
  level: 'none' | 'watch' | 'warning' | null;
  tMinC: number | null;
  precipMm: number | null;
  icing: boolean;
}

export interface SupportMatchDto {
  support: {
    id: string;
    title: string;
    summary: string;
    applyFrom?: string | null;
    applyTo?: string | null;
    source: string;
    sourceUrl?: string | null;
    sourceDate: string;
    sourceVersion: string;
  };
  why: string[];
  /** Taslak kayıt: çiftçi ekranında hiç gösterilmez. */
  badge: boolean;
  status: 'acik' | 'kapali' | 'donem-bilinmiyor' | 'onay-bekliyor';
}

export interface ResmiKaynakDto {
  id: string;
  name: string;
  kind: string;
  province: string | null;
  district: string | null;
  url: string;
  lastCheckedAt: string | null;
  lastStatus: string | null;
  lastNewCount: number;
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
  province?: string | null;
  lat?: number | null;
  lon?: number | null;
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

export type NdviTrendDto =
  | { kind: 'drop'; latest: number; baseline: number; drop: number; date: string }
  | { kind: 'normal'; latest: number; baseline: number; date: string }
  | { kind: 'unknown'; reason: 'yetersiz-veri' };

export type NdviDto =
  | {
      kind: 'series';
      fieldId: string;
      fieldName: string;
      points: { from: string; to: string; mean: number; validFraction: number }[];
      skipped: number;
      trend: NdviTrendDto;
      source: { name: string; version: string; date: string };
      fetchedAt: string;
      stale: boolean;
      sample: boolean;
      needsBadge: true;
    }
  | { kind: 'none'; reason: 'sinir-yok' | 'veri-yok'; fieldId: string };

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
    // --- G24: şifreli giriş, kayıt, yetkili ---
    register: (b: { phone: string; code: string; password: string; name?: string; kvkk: true }) =>
      request<{ token: string; userId: string }>('POST', '/auth/register', b),
    login: (phone: string, password: string) =>
      request<{ token: string; userId: string; roles: string[]; mfaRequired: boolean }>(
        'POST',
        '/auth/login',
        { phone, password },
      ),
    resetPassword: (b: { phone: string; code: string; password: string }) =>
      request<{ token: string; userId: string }>('POST', '/auth/password/reset', b),
    staffRegister: (b: StaffRegisterBody) =>
      request<{ token: string; userId: string }>('POST', '/auth/staff/register', b),
    mfaSmsRequest: () => request<{ expiresInSeconds: number }>('POST', '/auth/mfa/sms/request'),
    mfaSmsVerify: (code: string) => request<{ ok: true }>('POST', '/auth/mfa/sms/verify', { code }),
    logout: () => request<void>('POST', '/auth/logout'),
    staffMe: () => request<StaffMeDto>('GET', '/staff/me'),
    staffAnnouncements: () => request<StaffAnnouncementDto[]>('GET', '/staff/announcements'),
    createAnnouncement: (b: AnnouncementCreateBody) =>
      request<{ id: string; reviewStatus: string }>('POST', '/announcements', b),
    staffDrafts: () => request<StaffDraftDto[]>('GET', '/staff/drafts'),
    approveAnnouncement: (id: string) =>
      request<{ id: string }>('POST', `/announcements/${q(id)}/approve`),
    deleteAnnouncement: (id: string) => request<unknown>('DELETE', `/announcements/${q(id)}`),
    expertQueue: () => request<QueueItemDto[]>('GET', '/pusula/queue'),
    expertAnswered: () => request<AnsweredItemDto[]>('GET', '/pusula/answered'),
    questionImage: (id: string) =>
      request<{ mime: string; base64: string } | null>('GET', `/pusula/queue/${q(id)}/image`),
    answerQuestion: (id: string, b: { answer: string; source: string; cacheable: boolean }) =>
      request<{ id: string }>('POST', `/pusula/queue/${q(id)}/answer`, b),
    myQuestions: () => request<MyQuestionDto[]>('GET', '/pusula/my'),
    inbox: () => request<InboxItemDto[]>('GET', '/me/notifications'),
    inboxRead: () => request<{ ok: true }>('POST', '/me/notifications/read'),
    staffApplications: () => request<StaffApplicationDto[]>('GET', '/panel/staff'),
    staffDecision: (userId: string, approve: boolean, note?: string) =>
      request<{ status: string }>('POST', `/panel/staff/${q(userId)}/decision`, { approve, note }),
    requestOtp: (phone: string) => request<{ ok: boolean }>('POST', '/auth/otp/request', { phone }),
    verifyOtp: (phone: string, code: string) =>
      request<{ token: string; userId: string }>('POST', '/auth/otp/verify', { phone, code }),
    /** Yalnız demo sunucusunda vardır; başka yerde 404 (ApiError) döner. */
    demoInfo: () =>
      request<{ demo: true; code: string; farmerPhone: string; staffPhone: string }>(
        'GET',
        '/demo/info',
      ),
    /** Ürünün örnek ana sayfa içeriği. Yalnız demo sunucusunda vardır; başka yerde 404 (ApiError). */
    ornekIcerik: (cropId: string) =>
      request<OrnekIcerikDto>('GET', `/demo/ornek-icerik/${q(cropId)}`),
    provinces: () => request<string[]>('GET', '/places/provinces'),
    districts: (province: string) =>
      request<string[]>('GET', `/places/districts?province=${q(province)}`),
    villages: (province: string, district: string, search?: string) =>
      request<PlaceDto[]>(
        'GET',
        `/places/villages?province=${q(province)}&district=${q(district)}${search ? `&q=${q(search)}` : ''}`,
      ),
    resmiKaynaklar: () => request<{ sources: ResmiKaynakDto[] }>('GET', '/resmi-kaynaklar'),
    marketCrops: () => request<{ id: string; name: string }[]>('GET', '/market/crops'),
    marketPrices: (cropId: string, fieldId?: string) =>
      request<MarketDto>(
        'GET',
        `/market/prices?crop=${q(cropId)}${fieldId ? `&fieldId=${q(fieldId)}` : ''}`,
      ),
    wallet: () => request<WalletDto>('GET', '/me/wallet'),
    exportData: () => request<unknown>('GET', '/me/export'),
    revokeShare: (id: string) => request<undefined>('DELETE', `/me/shares/${q(id)}`),
    today: (fieldId: string) => request<TodayDto>('GET', `/fields/${q(fieldId)}/today`),
    ndvi: (fieldId: string) => request<NdviDto>('GET', `/fields/${q(fieldId)}/ndvi`),
    calendar: (fieldId: string, days = 90) =>
      request<CalendarDto>('GET', `/fields/${q(fieldId)}/calendar?days=${days}`),
    supports: (fieldId: string) =>
      request<{ matches: SupportMatchDto[]; today: string }>(
        'GET',
        `/supports?fieldId=${q(fieldId)}`,
      ),
    announcements: (fieldId: string) =>
      request<{ announcements: AnnouncementDto[] }>('GET', `/fields/${q(fieldId)}/announcements`),
    registerPush: (token: string, platform: 'ios' | 'android' | 'web') =>
      request<{ ok: boolean }>('POST', '/me/push-token', { token, platform }),
    crops: () => request<CropDto[]>('GET', '/crops'),
    kcTable: () => request<KcRowDto[]>('GET', '/crops/kc-table'),
    soils: () => request<SoilRowDto[]>('GET', '/soils'),
    devices: () => request<DeviceDto[]>('GET', '/devices'),
    registerDevice: (body: DeviceRegister) =>
      request<DeviceDto & { sample: boolean; message: string }>('POST', '/devices', body),
    deleteDevice: (id: string) => request<undefined>('DELETE', `/devices/${q(id)}`),
    readings: (id: string, metric = 'soil-moisture', hours = 72) =>
      request<ReadingsDto>('GET', `/devices/${q(id)}/readings?metric=${q(metric)}&hours=${hours}`),
    addReadings: (id: string, csv: string) =>
      request<{ inserted: number; duplicates: number; rejected: number; errors: unknown[] }>(
        'POST',
        `/devices/${q(id)}/readings`,
        { csv },
      ),
    reminders: (fieldId: string, params: string) =>
      request<RemindersDto>('GET', `/fields/${q(fieldId)}/reminders?${params}`),
    savings: (fieldId: string, params: string) =>
      request<SavingsDto>('GET', `/fields/${q(fieldId)}/savings?${params}`),
    deviceStatus: (id: string) => request<DeviceStatusDto>('GET', `/devices/${q(id)}/status`),
    /** Sulama komutu ASLA çevrimdışı sıraya alınmaz: geç icra edilen vana komutu tehlikelidir. */
    sendCommand: (id: string, body: CommandCreate) =>
      request<CommandDto>('POST', `/devices/${q(id)}/commands`, body),
    fields: () => request<FieldDto[]>('GET', '/fields'),
    createField: (f: FieldCreate) => request<FieldDto>('POST', '/fields', f),
    deleteField: (id: string) => request<void>('DELETE', `/fields/${q(id)}`),
    updateField: (id: string, patch: FieldUpdate) =>
      request<FieldDto>('PATCH', `/fields/${q(id)}`, patch),
    pusulaAsk: (body: {
      question: string;
      fieldId?: string;
      image?: { mime: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };
    }) => request<{ card: PusulaCardDto }>('POST', '/pusula/ask', body),
    robotSohbet: (body: {
      soru: string;
      urun?: string | null;
      il?: string | null;
      gecmis?: string[];
    }) =>
      request<{ cevap: string; yonlendir: string | null; kaynak: string }>(
        'POST',
        '/robot/sohbet',
        body,
      ),
    robotSes: (metin: string) =>
      request<{ ses: { mime: string; ses_b64: string } | null }>('POST', '/robot/ses', { metin }),
    nearbyCreateCode: () => request<{ code: string; expiresAt: string }>('POST', '/nearby/codes'),
    nearbyClaim: (code: string, field: FieldCreate) =>
      request<{ proposalId: string }>('POST', '/nearby/claim', { code, field }),
    nearbyProposals: () => request<ProposalDto[]>('GET', '/nearby/proposals'),
    nearbyDecide: (id: string, approve: boolean) =>
      request<{ status: string }>('POST', `/nearby/proposals/${id}/decision`, { approve }),
  };
}

export type Api = ReturnType<typeof createApi>;
