import { useEventCreatableGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GroupCard } from '../../../group/GroupCard';
import type { WizardStepProps } from '../draft';
import { colors, radius, space } from '../../../../theme';
import { Button, EmptyState, emptyIcon, Text, useConfirm } from '../../../ui';

/**
 * Group (UX-CEVT-02, B14). Every group you may create an event in — across your communities,
 * or only the one the wizard was opened from. A tap on a card IS the answer: it sets the group
 * and advances, leaving no selected state behind (UX-CEVT-01).
 *
 * A newly picked group starts the event public (see `applyPatch`); Preferences can still make it
 * private.
 */
export function Step1Group({ advance, communityId }: WizardStepProps) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const groups = useEventCreatableGroups(communityId);

  if (groups.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  // A failed load is not "you have no groups" — say so, and offer a retry.
  if (groups.isError) {
    return (
      <EmptyState
        tone="error"
        title={tc('loadError')}
        action={{ label: tc('retry'), onPress: () => void groups.refetch() }}
        testID="error-step1-groups"
      />
    );
  }

  const rows = groups.data ?? [];
  // The community is already known when the wizard was opened from one; the name only helps
  // tell groups apart when they come from several.
  const showCommunity = !communityId && new Set(rows.map((g) => g.community_id)).size > 1;

  return (
    <View style={styles.container}>
      <Text variant="body" tone="muted">
        {t('step1Subtitle')}
      </Text>
      {rows.length === 0 ? (
        <EmptyState
          icon={emptyIcon('person.3')}
          title={t('noGroupsYet')}
          body={t('step1GroupEmptyBody')}
          testID="empty-step1-groups"
        />
      ) : (
        // Full-width list → the horizontal card (UX-GLOB-09).
        rows.map((group) => (
          // The wizard sits on the card colour, so the card gets a border to stand apart.
          <View key={group.group_id} style={styles.cardFrame}>
            <GroupCard
              group={{
                id: group.group_id,
                name: group.name,
                thumbnail_path: group.thumbnail_path,
                is_private: group.is_private,
                community_name: showCommunity ? group.community_name : null,
              }}
              memberCount={group.member_count}
              onPress={() =>
                advance?.({ groupId: group.group_id, groupCommunityId: group.community_id })
              }
            />
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The fixed bottom area of the Group step: "Continue without group" as a plain button, the
 * ranking consequence as supporting text under it (not inside it), and a confirmation sheet
 * before it commits. An event without a group is a normal path — one-off events with people
 * outside your communities — so it is always offered, not only when you have no groups.
 */
export function NoGroupFooter({ advance }: WizardStepProps) {
  const { t } = useT('event');
  const confirm = useConfirm();

  const onPress = async () => {
    const ok = await confirm({
      title: t('noGroupSheetTitle'),
      body: t('noGroupSheetBody'),
      confirmLabel: t('noGroupSheetConfirm'),
      cancelLabel: t('noGroupSheetCancel'),
    });
    if (ok) advance?.({ groupId: null });
  };

  return (
    <View style={styles.footer}>
      <Button
        label={t('noGroupOption')}
        variant="secondary"
        fullWidth
        onPress={() => void onPress()}
        testID="event-wizard-no-group"
      />
      <Text variant="caption" tone="muted" style={styles.support}>
        {t('noGroupHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[3] },
  cardFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  loading: { paddingVertical: space[6], alignItems: 'center' },
  footer: { gap: space[2] },
  support: { textAlign: 'center' },
});
