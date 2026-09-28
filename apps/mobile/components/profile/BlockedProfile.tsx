/**
 * What to render when `get_player_profile` comes back empty.
 *
 * It returns ZERO ROWS for a block in either direction, so "no row" alone cannot say which
 * situation you are in. Cross-referencing `list_my_blocks` splits it in two:
 *
 *   - YOU blocked THEM — `BlockedProfile`: photo, name and Unblock, everything else removed. The
 *     name and photo come from `list_my_blocks`, because the read policy hides the row from the
 *     blocker too. This is UX-PROF-03's collapsed profile, and it also serves its "opening a
 *     blocked profile from elsewhere" case — naming who it is and offering the action beats a
 *     generic page that makes you go and find them.
 *   - ANYTHING ELSE — `UnavailableProfile`, deliberately neutral. It covers a profile that no
 *     longer exists as well as someone who blocked YOU, and it must not mention unblocking in
 *     either case: there is nothing for this viewer to unblock, and saying so to a deleted account
 *     is simply wrong. (Someone who blocked you should never be reachable at all — migration 0102
 *     closed the `explore_players` hole that let them be. This is the deep-link fallback, not the
 *     fence.)
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
        variant="secondary"
        loading={unblock.isPending}
        onPress={() => unblock.mutate(blocked.id, { onSuccess: onUnblocked })}
        testID="unblock-action"
      />
    </View>
  );
}

export function UnavailableProfile() {
  const { t } = useT('profile');
  return (
    <EmptyState
      fill
      icon={emptyIcon('exclamationmark.triangle')}
      title={t('unavailable')}
      testID="unavailable-profile"
    />
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: space[6], paddingHorizontal: space[4], gap: space[3], backgroundColor: colors.background },
});
