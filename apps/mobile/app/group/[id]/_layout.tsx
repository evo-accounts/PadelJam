import { Stack, useLocalSearchParams } from 'expo-router';

import { useGroupRealtime } from '@padel/api';

/**
 * Per-group Stack (mirrors `community/[id]`): `index` is the group home; `members`, `invite`,
 * `events`, `ranking`, `season/[number]` and `join` (a group invitation, UX-GRP-02) are pushed
 * siblings; `manage` holds the admin screens the Manage Group
 * sheet opens (there is no manage hub screen since UX-GRP-10).
 */
export default function GroupIdLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  useGroupRealtime(id);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="members" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="events" />
      <Stack.Screen name="ranking" />
      <Stack.Screen name="season/[number]" />
      <Stack.Screen name="join" />
      <Stack.Screen name="manage" />
    </Stack>
  );
}
