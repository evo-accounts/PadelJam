import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="location" />
      <Stack.Screen name="hand" />
      <Stack.Screen name="side" />
      <Stack.Screen name="jammer-plus" />
    </Stack>
  );
}
