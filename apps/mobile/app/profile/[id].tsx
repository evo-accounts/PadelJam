/**
 * Another player's profile. The header owns every action (UX-PROF-01, UX-PROF-02): a bare back
 * arrow on the left — arrow only, no "Back" label — and ••• top-right. Both used to sit in the
 * screen body, which is the one part of the audit's "Problem" text that is still true.
 *
 * The sheet itself lives in `useProfileActions`, because UX-PROF-05 gives every follow-list row a
 * "⋯" that opens the same one.
 */
import { useProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/ProfileView';
import { useProfileActions } from '@/components/profile/useProfileActions';
import { useGoBack } from '@/lib/useGoBack';
import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function PlayerProfileScreen() {
  const goBack = useGoBack();
  const { t } = useT('profile');
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = id ?? '';

  const query = useProfile(userId);
  // Blocking makes the profile behind the sheet inaccessible, so staying on it would only show the
  // collapsed state to someone who did not ask for it.
  const actions = useProfileActions({ onBlocked: () => goBack() });

  const p = query.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <TopBar
        onBack={goBack}
        actions={
          p
            ? [
                {
                  icon: (
                    <SymbolView
                      name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' } as never}
                      tintColor={colors.foreground}
                      size={22}
                    />
                  ),
                  label: t('more'),
                  onPress: () =>
                    void actions.open({
                      id: userId,
                      full_name: p.full_name,
                      is_following: p.is_following,
                    }),
                  testID: 'profile-actions',
                },
              ]
            : undefined
        }
      />
      <ScrollView style={{ flex: 1 }}>
        <ProfileView userId={userId} isSelf={false} />
      </ScrollView>
      {actions.sheets}
    </SafeAreaView>
  );
}
