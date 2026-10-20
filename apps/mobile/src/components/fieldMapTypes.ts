export interface MapPoint {
  lat: number;
  lon: number;
}

export interface FieldMapProps {
  /** Açılış merkezi. Sonradan değişirse harita oraya gider; işaret taşımak merkezi değiştirmez. */
  center: MapPoint;
  zoom: number;
  marker: MapPoint | null;
  onPick: (p: MapPoint) => void;
  /** Kullanıcı kıstırarak yakınlaştırırsa bildirilir (+/- düğmeleri ile senkron kalır). */
  onZoom?: (zoom: number) => void;
  testID?: string;
}
