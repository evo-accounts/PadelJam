import { Stack, useLocalSearchParams } from 'expo-router';

import { useGroupRealtime } from '@padel/api';

/**
 * Per-group Stack (mirrors `community/[id]`): `index` is the group home, `members`
 * and `invite` are pushed siblings, `join` is a modal so non-members can join /
 * accept without losing context, and `manage` is the admin sub-stack.
 */
export default function GroupIdLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useGroupRealtime(id);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="members" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="join" options={{ presentation: 'modal' }} />
      <Stack.Screen name="manage" />
    </Stack>
  );
}
