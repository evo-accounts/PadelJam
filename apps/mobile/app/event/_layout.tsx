import { Stack } from 'expo-router';

export default function EventStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/*
        "You are in" (UX-JEVT-03) covers the event page and closes back onto it. A plain card push
        that slides up, not `presentation: 'fullScreenModal'`: on #210's E2E run the fullScreenModal
        was never shown after a confirmed Join (the page stayed underneath, and the next sign-in
        found its Continue button inert), while card pushes from this stack are proven by every
        suite. It still fills the display; only the UIKit presentation differs.
      */}
      <Stack.Screen name="[id]/joined" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
    </Stack>
  );
}
