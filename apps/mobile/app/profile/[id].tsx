/**
 * Another player's profile. The header owns every action (UX-PROF-01, UX-PROF-02): a bare back
 * arrow on the left — arrow only, no "Back" label — and ••• top-right. Both used to sit in the
 * screen body, which is the one part of the audit's "Problem" text that is still true.
 */
import { useBlock, useFollow, useProfile, useReport, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileView } from '@/components/profile/ProfileView';
import { ReportSheet } from '@/components/profile/BlockReportModals';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../theme';
import { BottomSheet, Button, Text, TopBar, useActionSheet, useBanner } from '../../components/ui';

export default function PlayerProfileScreen() {
  const goBack = useGoBack();
  const router = useRouter();
  const { t } = useT('profile');
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = id ?? '';

  const query = useProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const report = useReport();
  const show = useActionSheet();
  const banner = useBanner();

  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const p = query.data;
  const name = p?.full_name ?? '';

  const openActions = async () => {
    if (!p) return;
    const key = await show({
      actions: [
        { key: 'share', label: t('kebabShare') },
        {
          key: 'follow',
          label: p.is_following ? t('kebabUnfollow') : t('kebabFollow'),
        },
        // UX-PROF-02: Message only once you follow them, and this sheet is the ONLY route to
        // messaging from a profile. It matches the surface it opens onto — chat/new lists exactly
        // the people you follow, so offering it here for anyone else would dead-end.
        ...(p.is_following ? [{ key: 'message', label: t('kebabMessage') }] : []),
        { key: 'block', label: t('kebabBlock'), destructive: true },
        { key: 'report', label: t('kebabReport') },
      ],
    });

    if (key === 'share') void Share.share({ message: name });
    if (key === 'follow') (p.is_following ? unfollow : follow).mutate(userId);
    if (key === 'message') router.push('/chat/new');
    // Both open AFTER `show()` resolves, which is only once the host has dismissed its own modal —
    // that is what stops a second sheet racing the first one off the screen.
    if (key === 'block') setBlockOpen(true);
    if (key === 'report') setReportOpen(true);
  };

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
                  onPress: openActions,
                  testID: 'profile-actions',
                },
              ]
            : undefined
        }
      />
      <ScrollView style={{ flex: 1 }}>
        <ProfileView userId={userId} isSelf={false} />
      </ScrollView>

      {/* UX-PROF-03: a sheet that states the consequence, not a bare confirm. */}
      <BottomSheet
        visible={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={t('blockConfirmTitle')}
        testID="block-sheet"
      >
        <Text variant="body" tone="muted">
          {t('blockConfirmBody')}
        </Text>
        <View style={{ gap: space[2], marginTop: space[3] }}>
          <Button
            variant="destructive"
            fullWidth
            label={t('blockConfirm')}
            loading={block.isPending}
            testID="block-confirm"
            onPress={() =>
              block.mutate(userId, {
                onSuccess: () => {
                  setBlockOpen(false);
                  // The temporary message the audit asks for, then out of the screen: the profile
                  // behind it has just become inaccessible, so staying on it would only show the
                  // collapsed state to someone who did not ask for it.
                  banner.show(t('blockedBanner', { name }), 'success');
                  goBack();
                },
              })
            }
          />
          <Button variant="ghost" fullWidth label={t('cancel')} onPress={() => setBlockOpen(false)} />
        </View>
      </BottomSheet>

      <ReportSheet
        visible={reportOpen}
        onCancel={() => setReportOpen(false)}
        onSubmit={(reason, description) => {
          setReportOpen(false);
          report.mutate(
            { targetId: userId, reason, description },
            {
              // The old call site fired and forgot: the sheet closed optimistically and a failure
              // was silent, so a report that never landed looked identical to one that did.
              onSuccess: () => banner.show(t('reportSent'), 'success'),
              onError: () => banner.show(t('reportFailed')),
            },
          );
        }}
      />
    </SafeAreaView>
  );
}
