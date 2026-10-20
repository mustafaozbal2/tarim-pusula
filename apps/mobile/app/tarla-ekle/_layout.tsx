import { Stack } from 'expo-router';
import { colors } from '@tarim/ui';

export default function AddFieldLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'none',
      }}
    />
  );
}
