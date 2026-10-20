/**
 * Uydu haritası altlığı. Varsayılan: EOX "Sentinel-2 cloudless" (Copernicus Sentinel verisi, atıf zorunlu).
 * Üretimde sözleşmeli bir sağlayıcıya geçmek için EXPO_PUBLIC_TILE_URL ve EXPO_PUBLIC_TILE_ATTRIBUTION verilir.
 */
export const DEFAULT_TILE_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg';
export const DEFAULT_ATTRIBUTION =
  'Sentinel-2 cloudless — s2maps.eu, EOX IT Services GmbH (Copernicus Sentinel verisi, 2021)';

export interface RasterStyle {
  version: 8;
  sources: Record<
    string,
    { type: 'raster'; tiles: string[]; tileSize: number; maxzoom: number; attribution: string }
  >;
  layers: { id: string; type: 'raster'; source: string }[];
}

export function satelliteStyle(
  tileUrl = process.env['EXPO_PUBLIC_TILE_URL'] ?? DEFAULT_TILE_URL,
  attribution = process.env['EXPO_PUBLIC_TILE_ATTRIBUTION'] ?? DEFAULT_ATTRIBUTION,
): RasterStyle {
  return {
    version: 8,
    sources: {
      uydu: { type: 'raster', tiles: [tileUrl], tileSize: 256, maxzoom: 14, attribution },
    },
    layers: [{ id: 'uydu', type: 'raster', source: 'uydu' }],
  };
}

/** Türkiye'nin kabaca ortası; konum bilinmiyorsa harita buradan açılır. */
export const TURKEY_CENTER = { lat: 39.0, lon: 35.2, zoom: 5 } as const;
export const FIELD_ZOOM = 15;
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 18;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Noktaya göre açılış zoomu: köy merkezi için orta, GPS için yakın. */
export function zoomFor(source: 'gps' | 'koy' | 'harita' | 'yakin' | null): number {
  if (source === 'gps') return 16;
  if (source === 'koy') return 13;
  return TURKEY_CENTER.zoom;
}
