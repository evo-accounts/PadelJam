import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';
import { colors } from '../../../../theme';

/**
 * Admin "Manage group" Stack. Each screen sets its own header title from the
 * `group` i18n namespace; the index is the entry menu.
 */
export default function GroupManageLayout() {
  const { t } = useT('group');
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('manageTitle') }} />
      <Stack.Screen name="settings" options={{ title: t('editTitle') }} />
      <Stack.Screen name="members" options={{ title: t('membersTitle') }} />
      <Stack.Screen name="seasons" options={{ title: t('seasonsTitle') }} />
    </Stack>
  );
}
