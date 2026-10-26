export const DEFAULT_TILE_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg';
export const DEFAULT_ATTRIBUTION =
  'Sentinel-2 cloudless — s2maps.eu, EOX IT Services GmbH (Copernicus Sentinel verisi, 2021)';

/**
 * Uydu altlığı sağlayıcı adaptörü. Seçim EXPO_PUBLIC_MAP_PROVIDER bayrağıyla: esri | eox | maptiler | mapbox.
 * G23: varsayılan Esri World Imagery (yakında da net; EOX 14. seviyeden sonra bulanıklaşıyordu). Anahtar
 * gereken sağlayıcıda anahtar yoksa varsayılana düşülür. Lisans notları: docs/ARASTIRMA_HARITA.md.
 * Parsel verisi bu katmanda YOKTUR (TKGM izni olmadan çağrı yapılmaz).
 */
export type BasemapId = 'eox' | 'esri' | 'maptiler' | 'mapbox' | 'ozel';

export interface Basemap {
  id: BasemapId;
  tileUrl: string;
  attribution: string;
  maxzoom: number;
  /** İstenen sağlayıcı kullanılamadığı (anahtar yok) için varsayılana düşüldü mü. */
  fallback: boolean;
}

/** Haritanın en fazla yakınlaşması: kaynağın verdiği seviyenin 1 üstü (daha fazlası bulanık büyütmedir). */
export function viewMaxZoom(b: Pick<Basemap, 'maxzoom'>): number {
  return b.maxzoom + 1;
}

type Env = Record<string, string | undefined>;

const EOX: Basemap = {
  id: 'eox',
  tileUrl: DEFAULT_TILE_URL,
  attribution: DEFAULT_ATTRIBUTION,
  maxzoom: 14,
  fallback: false,
};

export const ESRI_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const ESRI: Basemap = {
  id: 'esri',
  tileUrl: ESRI_TILE_URL,
  attribution: 'Esri, Maxar, Earthstar Geographics ve GIS User Community',
  maxzoom: 18,
  fallback: false,
};

export function resolveBasemap(env: Env = process.env): Basemap {
  const custom = env['EXPO_PUBLIC_TILE_URL']?.trim();
  if (custom) {
    return {
      id: 'ozel',
      tileUrl: custom,
      attribution: env['EXPO_PUBLIC_TILE_ATTRIBUTION'] ?? DEFAULT_ATTRIBUTION,
      maxzoom: 18,
      fallback: false,
    };
  }
  const want = env['EXPO_PUBLIC_MAP_PROVIDER']?.trim().toLowerCase();
  if (want === 'eox') return EOX;
  if (want === 'maptiler') {
    const key = env['EXPO_PUBLIC_MAPTILER_KEY']?.trim();
    if (!key) return { ...ESRI, fallback: true };
    return {
      id: 'maptiler',
      tileUrl: `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${encodeURIComponent(key)}`,
      attribution: '© MapTiler © OpenStreetMap katkıda bulunanlar',
      maxzoom: 18,
      fallback: false,
    };
  }
  if (want === 'mapbox') {
    const token = env['EXPO_PUBLIC_MAPBOX_TOKEN']?.trim();
    if (!token) return { ...ESRI, fallback: true };
    return {
      id: 'mapbox',
      tileUrl: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${encodeURIComponent(token)}`,
      attribution: '© Mapbox © OpenStreetMap © Maxar',
      maxzoom: 18,
      fallback: false,
    };
  }
  return ESRI;
}
