import { useRouter } from 'expo-router';
import { Button, Card, Durum } from '@tarim/ui';
import { Screen } from '../src/components/Screen';
import { tr } from '../src/i18n/tr';

const t = tr.yieldMap;

/**
 * Verim Haritası: verim verisi (drone/ölçüm) bağlanana kadar dürüst boş durum. Veri uydurulmaz.
 * Uydu bitki yeşilliği (NDVI) ayrı ekranda; drone eklenince görev kartı Arazi İşlemleri'nde açılır.
 */
export default function YieldMapScreen() {
  const router = useRouter();
  return (
    <Screen title={t.title}>
      <Durum kind="bos" text={t.waiting} testID="verim-bekleniyor" />
      <Card>
        <Button label={tr.ndvi.open} variant="secondary" onPress={() => router.push('/ndvi')} />
      </Card>
      <Button label={t.addDevice} onPress={() => router.push('/cihaz-ekle')} />
    </Screen>
  );
}
