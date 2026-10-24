import { View } from 'react-native';
import { Badge } from '@tarim/ui';
import { DEMO_BUILD } from '../demo';
import { tr } from '../i18n/tr';

/** Demo derlemesinde her ekranın üstünde: gösterilen bilgi örnektir. Üretim derlemesinde hiçbir şey çizmez. */
export function DemoBadge() {
  if (!DEMO_BUILD) return null;
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Badge label={tr.common.sampleData} />
    </View>
  );
}
