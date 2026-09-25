import { Stack } from 'expo-router';

/**
 * Native headers are off everywhere (UX-GLOB-01): `TopBar` is the only
 * header, rendered by each screen itself. `create` is a task flow with the
 * navbar hidden (UX-GRP-01), presented modally like the community's own.
 */
export default function GroupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
