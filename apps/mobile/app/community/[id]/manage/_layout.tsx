import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';

/**
 * Admin "Manage community" Stack. Each screen sets its own header title from the
 * `community` i18n namespace; the index is the entry menu.
 */
export default function ManageLayout() {
  const { t } = useT('community');
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#0B1F3A',
        headerTitleStyle: { color: '#0B1F3A' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('manageTitle') }} />
      <Stack.Screen name="settings" options={{ title: t('manageSettings') }} />
      <Stack.Screen name="permissions" options={{ title: t('managePermissions') }} />
      <Stack.Screen name="members" options={{ title: t('manageMembers') }} />
      <Stack.Screen name="requests" options={{ title: t('manageRequests') }} />
      <Stack.Screen name="invite" options={{ title: t('manageInvite') }} />
    </Stack>
  );
}
