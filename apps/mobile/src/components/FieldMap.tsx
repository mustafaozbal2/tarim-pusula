import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { satelliteStyle } from '../location/mapStyle';
import type { FieldMapProps } from './fieldMapTypes';

const style = satelliteStyle();

/** Cihaz haritası: MapLibre Native (uydu altlığı). Dokunulan nokta `onPick` ile bildirilir. */
export default function FieldMap({ center, zoom, marker, onPick, testID }: FieldMapProps) {
  return (
    <View style={styles.fill} testID={testID} accessibilityLabel="Uydu haritası">
      <Map
        style={styles.fill}
        mapStyle={style as never}
        onPress={(e) => {
          const [lon, lat] = e.nativeEvent.lngLat;
          if (lon !== undefined && lat !== undefined) onPick({ lat, lon });
        }}
      >
        <Camera center={[center.lon, center.lat]} zoom={zoom} />
        {marker ? (
          <Marker lngLat={[marker.lon, marker.lat]} anchor="bottom">
            <Svg width={56} height={72} viewBox="0 0 24 31" accessibilityLabel="Tarla işareti">
              <Path
                d="M12 30s10-9 10-18a10 10 0 0 0-20 0c0 9 10 18 10 18z"
                fill="#9B2F1E"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              <Circle cx={12} cy={12} r={4} fill="#FFFFFF" />
            </Svg>
          </Marker>
        ) : null}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
