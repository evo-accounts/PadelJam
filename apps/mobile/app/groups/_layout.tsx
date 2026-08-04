import { Stack } from 'expo-router';

import { colors } from '../../theme';

/**
 * "My Groups" (the Home see-all) had no layout, so the root stack's
 * `headerShown: false` applied and the screen rendered without a header — the
 * "header is visually cut off" half of UX-HOME-05. The title and the top-right
 * action were already declared on the screen; they had nowhere to draw.
 */
export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
      }}
    />
  );
}
