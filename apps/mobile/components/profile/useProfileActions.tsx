/**
 * The UX-PROF-02 actions sheet, in one place.
 *
 * It began inline in `app/profile/[id].tsx`, which was fine while the profile header was its only
 * caller. UX-PROF-05 adds a second: every row of the follower and following lists carries a "⋯"
 * that must open "the same actions sheet defined in UX-PROF-02". Copying it would have meant two
 * definitions of which actions exist, when Message is offered, and what blocking says — three
 * things that are supposed to be answered once.
 *
 * Returns `open(person)` plus the `sheets` to render. The sheets have to come back to the caller
 * rather than mount themselves, because a `BottomSheet` is a React Native `Modal` and the caller
 * decides where in its tree that lives.
 */
import { useBlock, useFollow, useReport, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { ReportSheet } from './BlockReportModals';
import { space } from '../../theme';
import { BottomSheet, Button, Text, useActionSheet, useBanner } from '../ui';

export type ActionTarget = { id: string; full_name: string; is_following: boolean };

export function useProfileActions({ onBlocked }: { onBlocked?: (id: string) => void } = {}) {
  const { t } = useT('profile');
  const router = useRouter();
  const follow = useFollow();
  const unfollow = useUnfollow();
  const block = useBlock();
  const report = useReport();
  const show = useActionSheet();
  const banner = useBanner();

  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const open = async (person: ActionTarget) => {
    const key = await show({
      actions: [
        { key: 'share', label: t('kebabShare') },
        { key: 'follow', label: person.is_following ? t('kebabUnfollow') : t('kebabFollow') },
        // Only once you follow them, and this sheet is the ONLY route to messaging from a profile
        // or a follow list. It matches the surface it opens onto: chat/new lists exactly the
        // people you follow, so offering it for anyone else would dead-end.
        ...(person.is_following ? [{ key: 'message', label: t('kebabMessage') }] : []),
        { key: 'block', label: t('kebabBlock'), destructive: true },
        { key: 'report', label: t('kebabReport') },
      ],
    });

    if (key === 'share') void Share.share({ message: person.full_name });
    if (key === 'follow') (person.is_following ? unfollow : follow).mutate(person.id);
    if (key === 'message') router.push('/chat/new');
    // Set the target BEFORE opening: the sheets read it, and `show()` has already resolved, which
    // means the host's own Modal is dismissed and nothing races the next one onto the screen.
    if (key === 'block' || key === 'report') setTarget(person);
    if (key === 'block') setBlockOpen(true);
    if (key === 'report') setReportOpen(true);
  };

  const sheets = (
    <>
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
            onPress={() => {
              if (!target) return;
              const { id, full_name } = target;
              block.mutate(id, {
                onSuccess: () => {
                  setBlockOpen(false);
                  banner.show(t('blockedBanner', { name: full_name }), 'success');
                  onBlocked?.(id);
                },
              });
            }}
          />
          <Button variant="tertiary" fullWidth label={t('cancel')} onPress={() => setBlockOpen(false)} />
        </View>
      </BottomSheet>

      <ReportSheet
        visible={reportOpen}
        onCancel={() => setReportOpen(false)}
        onSubmit={(reason, description) => {
          setReportOpen(false);
          if (!target) return;
          report.mutate(
            { targetId: target.id, reason, description },
            {
              onSuccess: () => banner.show(t('reportSent'), 'success'),
              onError: () => banner.show(t('reportFailed')),
            },
          );
        }}
      />
    </>
  );

  return { open, sheets };
}
