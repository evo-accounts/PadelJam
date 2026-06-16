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
    </Stack>
  );
}
