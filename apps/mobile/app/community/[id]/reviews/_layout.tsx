import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';

/**
 * Reviews sub-stack.
 * `index` lists all reviews; `write` is a modal for create / edit.
 */
export default function ReviewsLayout() {
  const { t } = useT('community');
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: '#0B1F3A',
        headerTitleStyle: { color: '#0B1F3A' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('reviewsTitle') }} />
      <Stack.Screen
        name="write"
        options={{ presentation: 'modal', title: t('reviewsWriteTitle') }}
      />
    </Stack>
  );
}
