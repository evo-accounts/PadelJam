/**
 * The player profile — UX-PROF-01 (another player) and the body of UX-PROF-06 (your own).
 *
 * One component for both, branching on `isSelf`, as before. What changed is the SHAPE: the screen
 * used to be an avatar, a name, two counts and two stats, with the ••• and the settings gear
 * floating in the body. It is now an identity block, tappable counts, a primary action, a stats
 * row and three sections — Preferences, Groups, Last results — every one of which renders its
 * empty state rather than disappearing. The audit's requirement is that a profile with almost
 * nothing filled in still reads as a profile, not as a broken screen.
 *
 * The header controls (back, •••, gear) belong to the ROUTE's `TopBar`, not here, so this stays a
 * body component and the two screens keep their own headers.
 *
 * `isSelf` shows no relationship actions and no Edit button. UX-PROF-06 removes the latter
 * outright — "there is no second place to edit the same data" — and that became safe the moment
 * Account Settings (UX-SET-02) shipped to replace it. Editing is reached from Settings, via the
 * gear in this screen's header.
 */
import { useFollow, useMyBlocks, useProfile, useUnfollow } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors, space } from '../../theme';
import { BlockedProfile, UnavailableProfile } from './BlockedProfile';
import { BadgeStat } from './BadgeStat';
import { ProfileGroups } from './ProfileGroups';
import { ProfilePreferences } from './ProfilePreferences';
import { ProfileResults } from './ProfileResults';
import { Avatar, Button, Loading, Text } from '../ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="sectionTitle">{title}</Text>
      {children}
    </View>
  );
}

export function ProfileView({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { t } = useT('profile');
  const router = useRouter();
  const query = useProfile(userId);
  const follow = useFollow();
  const unfollow = useUnfollow();
  // Only consulted when the profile comes back empty, which is the one case where "who blocked
  // whom" changes what the screen renders.
  const blocks = useMyBlocks();

  if (query.isLoading) return <Loading testID="profile-loading" />;

  const p = query.data;
  if (!p) {
    const blocked = (blocks.data ?? []).find((b) => b.id === userId);
    if (blocked) return <BlockedProfile blocked={blocked} onUnblocked={() => query.refetch()} />;
    return <UnavailableProfile />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Avatar uri={avatarUrl(p.avatar_url)} name={p.full_name} colourKey={userId} size="xl" decorative />
        <Text variant="title">{p.full_name}</Text>
        {p.description ? (
          <Text variant="body" tone="muted" style={styles.centred}>
            {p.description}
          </Text>
        ) : null}
        {p.location_text ? (
          <View style={styles.location}>
            <SymbolView
              name={{ ios: 'mappin', android: 'location_on', web: 'location_on' } as never}
              size={14}
              tintColor={colors.mutedForeground}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text variant="caption" tone="muted">
              {p.location_text}
            </Text>
          </View>
        ) : null}

        <View style={styles.counts}>
          <Pressable
            onPress={() => router.push(`/profile/${userId}/following`)}
            accessibilityRole="button"
            testID="count-following"
          >
            <Text variant="heading" style={styles.centred}>
              {p.following_count}
            </Text>
            <Text variant="caption" tone="muted">
              {t('followingCount')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/profile/${userId}/followers`)}
            accessibilityRole="button"
            testID="count-followers"
          >
            <Text variant="heading" style={styles.centred}>
              {p.followers_count}
            </Text>
            <Text variant="caption" tone="muted">
              {t('followersCount')}
            </Text>
          </Pressable>
        </View>

        {isSelf ? null : (
          // UX-PROF-01 puts the primary action BELOW the counts, and it is the only relationship
          // control on the screen — everything else moved into the header sheet (UX-PROF-02).
          <Button
            label={p.is_following ? t('following') : t('follow')}
            variant={p.is_following ? 'outline' : 'primary'}
            fullWidth
            loading={follow.isPending || unfollow.isPending}
            onPress={() => (p.is_following ? unfollow.mutate(userId) : follow.mutate(userId))}
            testID="follow-action"
          />
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="title">{p.played_matches}</Text>
          <Text variant="caption" tone="muted">
            {t('playedMatches')}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="title">{p.best_position ?? '—'}</Text>
          <Text variant="caption" tone="muted">
            {t('bestPosition')}
          </Text>
        </View>
        {/* The third card, and the only one that leads anywhere: a count of earned badges is a
            summary of a catalogue, so it has somewhere to go. `justifyContent: 'space-around'`
            already distributes three as readily as two, so the row needs no style change. */}
        <BadgeStat userId={userId} />
      </View>

      <Section title={t('preferences')}>
        <ProfilePreferences
          dominantHand={p.dominant_hand}
          courtSide={p.court_side}
          preferredTime={p.preferred_time}
        />
      </Section>

      <Section title={t('groupsTitle')}>
        <ProfileGroups userId={userId} />
      </Section>

      <Section title={t('resultsTitle')}>
        <ProfileResults userId={userId} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingBottom: space[8] },
  identity: { alignItems: 'center', paddingTop: space[4], paddingHorizontal: space[4], gap: space[2] },
  centred: { textAlign: 'center' },
  location: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  counts: { flexDirection: 'row', gap: space[8], marginVertical: space[2] },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space[6] },
  stat: { alignItems: 'center', gap: space[1] },
  section: { paddingHorizontal: space[4], paddingBottom: space[6], gap: space[3] },
});
