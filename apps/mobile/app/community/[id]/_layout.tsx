import { Stack } from 'expo-router';

/**
 * Per-community Stack: the `(home)` group renders the persistent hero + the five
 * Material Top Tabs; `join` is a sibling modal so non-members can join/request
 * without losing the tabs underneath.
 */
export default function CommunityIdLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(home)" />
      <Stack.Screen name="join" options={{ presentation: 'modal' }} />
      <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
      <Stack.Screen name="post/[postId]" />
      <Stack.Screen name="manage" />
    </Stack>
  );
}
