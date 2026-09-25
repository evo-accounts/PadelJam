import { Stack } from 'expo-router';

/**
 * The admin screens the Manage Group sheet opens (UX-GRP-10). The sheet replaced the old hub
 * screen, and Seasons is gone: resetting the ranking is a confirmation, past seasons live on the
 * group page, and archiving is a sheet action (UX-GRP-14). Native headers are off everywhere
 * (UX-GLOB-01): `TopBar` is the only header, rendered by each screen itself.
 */
export default function GroupManageLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* UX-GRP-11: Group Settings is presented as a sheet. */}
      <Stack.Screen name="settings" options={{ presentation: 'formSheet', sheetAllowedDetents: [1] }} />
      <Stack.Screen name="members" />
    </Stack>
  );
}
