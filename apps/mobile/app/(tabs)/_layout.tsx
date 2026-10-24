import { Tabs } from 'expo-router';
import { colors, fontFamily, TAB_HEIGHT, TAB_LABEL_FONT_SIZE } from '@tarim/ui';
import { Icon } from '../../src/components/Icon';
import { TABS } from '../../src/tabs';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarActiveBackgroundColor: colors.pistachio,
        tabBarStyle: {
          height: TAB_HEIGHT + 12,
          paddingTop: 4,
          paddingBottom: 6,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarItemStyle: { minHeight: TAB_HEIGHT, borderRadius: 8, marginHorizontal: 4 },
        tabBarLabelStyle: { fontFamily: fontFamily.extrabold, fontSize: TAB_LABEL_FONT_SIZE },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.route}
          name={t.route}
          options={{
            title: t.label,
            tabBarAccessibilityLabel: t.label,
            tabBarIcon: ({ color }) => <Icon name={t.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
