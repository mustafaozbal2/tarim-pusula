import { Map as GlMap, Marker as GlMarker, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { resolveBasemap, viewMaxZoom } from '../location/mapProvider';
import { satelliteStyle } from '../location/mapStyle';
import type { FieldMapProps } from './fieldMapTypes';

const PIN_SVG =
  '<svg width="56" height="72" viewBox="0 0 24 31" aria-hidden="true"><path d="M12 30s10-9 10-18a10 10 0 0 0-20 0c0 9 10 18 10 18z" fill="#9B2F1E" stroke="#FFFFFF" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="#FFFFFF"/></svg>';

/** Web haritası: maplibre-gl (WebGL). Mobil sürümle aynı arayüz. */
export default function FieldMap({ center, zoom, marker, onPick, onZoom, testID }: FieldMapProps) {
  const host = useRef<unknown>(null);
  const map = useRef<GlMap | null>(null);
  const pin = useRef<GlMarker | null>(null);
  const handlers = useRef({ onPick, onZoom });
  handlers.current = { onPick, onZoom };

  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    const m = new GlMap({
      container: el,
      style: satelliteStyle() as unknown as StyleSpecification,
      center: [center.lon, center.lat],
      zoom,
      maxZoom: viewMaxZoom(resolveBasemap()),
      attributionControl: { compact: true },
    });
    m.on('click', (e) => handlers.current.onPick({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    m.on('zoomend', () => handlers.current.onZoom?.(m.getZoom()));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
    // Harita bir kez kurulur; merkez ve zoom aşağıdaki etkilerle güncellenir.
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m && Math.abs(m.getZoom() - zoom) > 0.01) m.easeTo({ zoom, duration: 200 });
  }, [zoom]);

  useEffect(() => {
    map.current?.jumpTo({ center: [center.lon, center.lat] });
  }, [center.lat, center.lon]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!marker) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (!pin.current) {
      const el = document.createElement('div');
      el.innerHTML = PIN_SVG;
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Tarla işareti');
      el.setAttribute('data-testid', 'tarla-isareti');
      pin.current = new GlMarker({ element: el, anchor: 'bottom' })
        .setLngLat([marker.lon, marker.lat])
        .addTo(m);
    } else {
      pin.current.setLngLat([marker.lon, marker.lat]);
    }
  }, [marker?.lat, marker?.lon, marker === null]);

  return (
    <View
      ref={host as never}
      testID={testID}
      style={{ flex: 1 }}
      accessibilityLabel="Uydu haritası"
    />
  );
}
