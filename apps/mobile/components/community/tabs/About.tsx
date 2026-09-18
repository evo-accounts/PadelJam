/**
 * The About tab (UX-COMM-12).
 *
 * This is where the community's identity lives now: UX-COMM-08 stripped the
 * header down to a thumbnail and a name, so the cover, the large thumbnail and
 * the name-in-full belong here rather than above every tab.
 *
 * Two changes from the version PR 4 left behind:
 *
 *  - Type / members / privacy were three label-and-value rows. The audit wants
 *    the same three attribute WIDGETS the preview shows, side by side, and they
 *    are literally the same component — an outsider and a member should not be
 *    reading two different renderings of one fact.
 *  - The rating was a Pressable wrapping a line of text, which "must read as
 *    tappable, not as a static summary with a text link". It is a `ListRow` with
 *    a chevron now, the same affordance every other destination row in the app
 *    uses.
 */
import { useCommunity, useCommunityMemberCount, useCommunityMembers, useCommunityReviews } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CommunityAttributes } from '@/components/community/CommunityAttributes';
import { useCommunityId } from '@/components/community/CommunityIdContext';
import { RulesModal } from '@/components/community/RulesModal';
import { avatarUrl, coverUrl, thumbnailUrl } from '@/lib/community-images';
import { Avatar, ListRow, Text } from '@/components/ui';
import { colors, radius, space } from '../../../theme';

const PRIVACY_SUMMARY_KEY: Record<string, string> = {
  public: 'privacySummaryPublic',
  request_to_join: 'privacySummaryRequest',
  private: 'privacySummaryPrivate',
};

const ROLE_LABEL_KEY: Record<string, string> = {
  admin: 'aboutAdminRole',
};

export default function CommunityAboutScreen() {
  const { t, i18n } = useT('community');
  const router = useRouter();
  const id = useCommunityId();
  const [showRules, setShowRules] = useState(false);

  const { data: community, isError } = useCommunity(id);
  const { data: members, isError: membersError } = useCommunityMembers(id);
  const { data: memberCount, isError: countError } = useCommunityMemberCount(id);
  const { data: reviews, isError: reviewsError } = useCommunityReviews(id);

  if (isError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text variant="body" tone="destructive">
          {t('loadError')}
        </Text>
      </View>
    );
  }

  if (!community) return <View style={styles.container} />;

  /**
   * The RPC first, the roster as a fallback.
   *
   * `community_member_count` (migration 0100) is the only way to count a
   * community whose roster you may not list. But a MEMBER can always list it,
   * and this tab is the member view — so when the RPC is unavailable the honest
   * number is right there. That matters concretely: 0100 is merged but not yet
   * applied to hosted, and without this the count would read "—" on every real
   * device while the data sat in the query beside it.
   */
  const rosterCount = membersError ? null : (members?.length ?? null);
  const shownCount = countError ? rosterCount : (memberCount ?? rosterCount);

  const admins = (members ?? []).filter((m) => m.role === 'admin');
  const cover = coverUrl(community.cover_image_path);
  const created = new Date(community.created_at).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hasReviews = reviews != null && reviews.count > 0 && reviews.average != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.cover}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <Avatar
          uri={thumbnailUrl(community.thumbnail_path)}
          name={community.name}
          colourKey={community.id}
          size="lg"
          decorative
        />
        <Text variant="title" style={styles.centred}>
          {community.name}
        </Text>
      </View>

      <CommunityAttributes
        type={community.type}
        privacy={community.privacy}
        memberCount={shownCount}
      />

      {community.description ? <Text variant="body">{community.description}</Text> : null}

      {community.location ? (
        <View style={styles.factRow}>
          <Text variant="label" tone="muted">
            {t('aboutLocationLabel')}
          </Text>
          <Text variant="label" style={styles.factValue} numberOfLines={2}>
            {community.location}
          </Text>
        </View>
      ) : null}

      <View style={styles.factRow}>
        <Text variant="label" tone="muted">
          {t('aboutCreatedLabel')}
        </Text>
        <Text variant="label" style={styles.factValue}>
          {created}
        </Text>
      </View>

      <Text variant="caption" tone="muted">
        {t(PRIVACY_SUMMARY_KEY[community.privacy] ?? 'privacySummaryPublic')}
      </Text>

      <View style={styles.section}>
        <Text variant="label" tone="muted">
          {t('aboutAdminsLabel')}
        </Text>
        {membersError ? (
          <Text variant="body" tone="destructive">
            {t('loadError')}
          </Text>
        ) : (
          admins.map((a) => (
            <ListRow
              key={a.user_id}
              title={a.profiles?.full_name ?? '—'}
              subtitle={t(ROLE_LABEL_KEY[a.role] ?? 'aboutAdminRole')}
              variant="plain"
              leading={
                <Avatar
                  uri={avatarUrl(a.profiles?.avatar_url)}
                  name={a.profiles?.full_name}
                  colourKey={a.user_id}
                  size="md"
                  decorative
                />
              }
              trailing={
                <Text variant="body" tone="muted">
                  ›
                </Text>
              }
              onPress={() => router.push(`/profile/${a.user_id}`)}
            />
          ))
        )}
      </View>

      {community.cancellation_rules_enabled && community.cancellation_rules_text ? (
        <Pressable onPress={() => setShowRules(true)} accessibilityRole="button" style={styles.section}>
          <Text variant="label" tone="primary">
            {t('cancellationRulesLink')}
          </Text>
        </Pressable>
      ) : null}

      {/*
        UX-COMM-12: "a tappable row with a chevron, opening Reviews. It must read
        as tappable, not as a static summary with a text link."
      */}
      <ListRow
        title={t('tabReviews')}
        subtitle={
          reviewsError
            ? t('loadError')
            : hasReviews
              ? t('reviewsSummary', { average: reviews!.average!.toFixed(1), count: reviews!.count })
              : t('noReviews')
        }
        subtitleTone={reviewsError ? 'destructive' : 'muted'}
        variant="card"
        onPress={() => router.push(`/community/${id}/reviews` as Href)}
        trailing={
          <Text variant="body" tone="muted">
            ›
          </Text>
        }
        testID="about-reviews-row"
      />

      {community.cancellation_rules_text ? (
        <RulesModal
          visible={showRules}
          text={community.cancellation_rules_text}
          onClose={() => setShowRules(false)}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: space[8] },
  content: { padding: space[4], gap: space[3] },
  centred: { textAlign: 'center' },
  identity: { alignItems: 'center', gap: space[2] },
  cover: {
    width: '100%',
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    marginBottom: space[2],
  },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[3] },
  factValue: { flexShrink: 1, textAlign: 'right' },
  section: { gap: space[1] },
});
