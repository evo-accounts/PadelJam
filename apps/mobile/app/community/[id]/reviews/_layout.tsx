import { Stack } from 'expo-router';

/**
 * Reviews sub-stack — one screen now.
 *
 * `write` used to be a second, modal-presented screen. UX-COMM-13 makes writing
 * a review a bottom SHEET, which the list screen owns as state, so the route is
 * gone rather than left declared and unreachable.
 *
 * Native headers stay off (UX-GLOB-01): `TopBar` is the only header, rendered by
 * the screen itself.
 */
export default function ReviewsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
