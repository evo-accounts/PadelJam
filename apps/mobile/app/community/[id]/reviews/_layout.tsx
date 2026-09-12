import { Stack } from 'expo-router';

/**
 * Reviews sub-stack. `index` lists all reviews; `write` is a modal for
 * create / edit. Native headers are off everywhere (UX-GLOB-01): `TopBar` is
 * the only header, rendered by each screen itself.
 */
export default function ReviewsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="write" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
