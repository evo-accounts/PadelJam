/**
 * The two states UX-PROF-03 asks for when a profile cannot be shown, and the difference between
 * them is the whole point.
 *
 * `get_player_profile` returns ZERO ROWS for a block in either direction, so "no row" on its own
 * cannot tell you which of two very different situations you are in:
 *
 *   - YOU blocked THEM — the profile collapses to photo, name and Unblock. You get the name and the
 *     photo from `list_my_blocks`, because the read policy hides the row from the blocker too.
 *   - THEY blocked YOU — a "no access" state with no identity at all. Telling someone who blocked
 *     them that they were blocked, and showing them the name, would defeat the point of blocking.
 *
 * The audit's third case — a user who blocked you should be absent from search and listings
 * entirely, so you never arrive here at all — is enforced in the database (migration 0102 closed
 * the `explore_players` hole). This screen is the fallback for a deep link, not the fence.
 */
import { useUnblock } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors, space } from '../../theme';
import { Avatar, Button, EmptyState, Text, emptyIcon } from '../ui';

export type BlockedBy = { id: string; full_name: string; avatar_url: string | null };

export function BlockedProfile({ blocked, onUnblocked }: { blocked: BlockedBy; onUnblocked?: () => void }) {
  const { t } = useT('profile');
  const unblock = useUnblock();

  return (
    <View style={styles.container} testID="blocked-profile">
      <Avatar uri={avatarUrl(blocked.avatar_url)} name={blocked.full_name} colourKey={blocked.id} size="xl" decorative />
      <Text variant="title">{blocked.full_name}</Text>
      <Button
        label={t('unblock')}
        variant="outline"
        loading={unblock.isPending}
        onPress={() => unblock.mutate(blocked.id, { onSuccess: onUnblocked })}
        testID="unblock-action"
      />
    </View>
  );
}

export function NoAccessProfile() {
  const { t } = useT('profile');
  return (
    <EmptyState
      fill
      icon={emptyIcon('exclamationmark.triangle')}
      title={t('noAccessTitle')}
      body={t('noAccessBody')}
      testID="no-access-profile"
    />
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: space[6], paddingHorizontal: space[4], gap: space[3], backgroundColor: colors.background },
});
