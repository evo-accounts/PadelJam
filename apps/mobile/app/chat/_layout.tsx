import { Stack } from 'expo-router';

/**
 * Native headers are off everywhere (UX-GLOB-01): `TopBar` is the only header,
 * rendered by each screen itself.
 *
 * `[cid]` stays at `headerShown: false` too — the conversation screen is
 * rendered by stream-chat-expo, which draws its own channel header with the
 * avatar and member list.
 */
export default function ChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[cid]" options={{ headerShown: false }} />
    </Stack>
  );
}
