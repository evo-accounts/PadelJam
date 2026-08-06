import { Stack } from 'expo-router';

import { colors } from '../../theme';

/**
 * Notifications had NO layout, so it inherited the root stack's
 * `headerShown: false` (app/_layout.tsx) and rendered no header at all.
 *
 * The screens were not missing header content — they were missing the header.
 * `notifications/index.tsx` already sets a title and an overflow kebab in
 * `headerRight`; both were dead code, drawn into a header that never existed.
 * The visible symptom was content starting at y=0, underneath the status bar,
 * which is what the UX audit reported as "the header is visually broken or cut
 * off" (UX-NOTIFICATION-09).
 *
 * Titles stay on the screens rather than being restated here: unlike the manage
 * stack, these two are unrelated pages that happen to share a folder, and
 * `partner-requests` sets its own.
 */
export default function NotificationsLayout() {
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
