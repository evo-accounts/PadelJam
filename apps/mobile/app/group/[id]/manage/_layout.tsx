import { Stack } from 'expo-router';

/**
 * Admin "Manage group" Stack. Native headers are off everywhere
 * (UX-GLOB-01): `TopBar` is the only header, rendered by each screen itself.
 */
export default function GroupManageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="members" />
      <Stack.Screen name="seasons" />
    </Stack>
  );
}
