import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="otp" />
      <Stack.Screen name="create-account" />
      <Stack.Screen name="password" />
      <Stack.Screen name="recovery" />
      <Stack.Screen name="new-password" />
      {/*
        The confirmation is a terminal screen (UX-AUTH-09): its only exit is the
        "Back to login" button. The session is already gone by the time it
        renders, so a back swipe would land on a new-password form with nothing
        to authorise it — disable the gesture rather than rely on every entry
        into this route having used `replace`.
      */}
      <Stack.Screen name="password-changed" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
