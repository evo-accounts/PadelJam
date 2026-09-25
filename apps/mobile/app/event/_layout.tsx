import { Stack } from 'expo-router';

export default function EventStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* "You are in" (UX-JEVT-03) covers the event page and closes back onto it. */}
      <Stack.Screen name="[id]/joined" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
    </Stack>
  );
}
