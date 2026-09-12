import { Stack } from 'expo-router';

/**
 * Admin "Manage community" Stack. Native headers are off everywhere
 * (UX-GLOB-01): `TopBar` is the only header, rendered by each screen itself.
 */
export default function ManageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="members" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="invite" />
    </Stack>
  );
}
