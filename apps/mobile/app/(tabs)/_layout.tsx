import { Tabs } from 'expo-router';
import { TABS } from '../../src/tabs';

/**
 * Hedef ana sayfada alt sekme çubuğu yoktur (G19): gezinme ikonlar ve sağ kenar menüsüyle olur.
 * Rotalar (/tarlalarim, /soru-sor, /pazar) derin bağlantılar için aynen çalışır.
 */
export default function TabsLayout() {
  return (
    <Tabs backBehavior="history" tabBar={() => null} screenOptions={{ headerShown: false }}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.route} name={t.route} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
