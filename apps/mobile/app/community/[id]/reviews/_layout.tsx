import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';
import { colors } from '../../../../theme';

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
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
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
