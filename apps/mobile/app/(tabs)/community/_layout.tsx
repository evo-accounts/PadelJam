import { Stack } from 'expo-router';

/**
 * The Community tab's stack. `(home)` is the community itself (UX-COMM-08) —
 * a navbar destination with no back button — and create/created are pushed on
 * top of it.
 */
export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(home)" />
      <Stack.Screen name="create" />
      <Stack.Screen name="created" />
    </Stack>
  );
}
