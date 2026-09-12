import { Stack } from 'expo-router';

/**
 * Native headers are off everywhere (UX-GLOB-01): `TopBar` is the only
 * header, rendered by each screen itself.
 */
export default function NotificationsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
