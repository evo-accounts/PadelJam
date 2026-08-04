import { Stack } from 'expo-router';

import { colors } from '../../theme';

/**
 * Same missing-header problem as notifications (UX-CHAT-07): no layout here
 * meant the root stack's `headerShown: false` applied, so `chat/index.tsx`'s
 * title AND its "+" new-chat button in `headerRight` were never drawn.
 *
 * `[cid]` keeps `headerShown: false` — the conversation screen is rendered by
 * stream-chat-expo, which draws its own channel header with the avatar and
 * member list. Two stacked headers there would be worse than none.
 */
export default function ChatLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
      }}
    >
      <Stack.Screen name="[cid]" options={{ headerShown: false }} />
    </Stack>
  );
}
