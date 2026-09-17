/**
 * The community preview — what someone who is NOT a member sees (UX-COMM-04/05/06).
 *
 * This replaces a screen that only ever did one thing: show a hero and a Join
 * button. The audit describes a state machine instead — member, invited,
 * requested, and the three privacy modes for someone with no relationship yet —
 * where each situation has its own action and two of them have no action at all.
 * `previewAction` holds that table; this renders it.
 *
 * IT IS A FULL SCREEN, not the bottom sheet UX-COMM-04 asks for. That was
 * decided when the plan was written (decision 4 in the audit) and applies to the
 * archived view too. One consequence worth naming: the audit's "✕ top-right"
 * was a sheet's dismiss. On a full screen UX-GLOB-01 governs, and its `edit`
 * variant puts ✕ on the LEFT — so that is where it is, rather than inventing a
 * fourth header shape for one screen.
 *
 * THE TABS ARE NOT HERE YET. UX-COMM-04 wants a public community's five tabs
 * readable from the preview, but a non-member cannot read any of them: posts,
 * groups and reviews are all gated on `is_community_member` and events on group
 * membership. Widening that is a privacy change with its own review, so the
 * preview shows what a non-member can actually see — the identity block, the
 * attributes, the admins and the rules — and the tabs arrive with the migration
 * that makes them readable.
 *
 * The route is still `join` because every caller and the `[id]/index` redirect
 * already point at it and the path is not user-visible.
 */
import {
  useAcceptInvitation,
  useCancelJoinRequest,
  useCommunity,
  useCommunityMembers,
  useCommunityStanding,
  useDeclineInvitation,
  useJoinCommunity,
  useSetDefaultCommunity,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AckGate } from '@/components/community/AckGate';
import { CommunityAttributes } from '@/components/community/CommunityAttributes';
import { actionNeedsAck, previewAction } from '@/components/community/previewAction';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { avatarUrl, coverUrl, thumbnailUrl } from '@/lib/community-images';
import { colors, radius, space } from '../../../theme';
import {
  Avatar,
  Button,
  Card,
  ListRow,
  Loading,
  Screen,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

const PRIVACY_SUMMARY_KEY: Record<string, string> = {
  public: 'privacySummaryPublic',
  request_to_join: 'privacySummaryRequest',
  private: 'privacySummaryPrivate',
};

/** Errors the server raises that have copy of their own; anything else is the generic one. */
const KNOWN_ERROR_KEYS = new Set([
  'community_full',
  'invite_required',
  'rules_acknowledgement_required',
  'invitation_not_found',
  'request_not_found',
]);

export default function CommunityPreviewScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const banner = useBanner();

  const { data: community, isLoading, isError } = useCommunity(id);
  const { data: members, isError: membersError } = useCommunityMembers(id);
  const { data: standing, isLoading: standingLoading } = useCommunityStanding(id);

  const join = useJoinCommunity(id);
  const cancelRequest = useCancelJoinRequest(id);
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();
  const setDefault = useSetDefaultCommunity();

  const [ack, setAck] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // router.replace twice in one frame pushes a second animation onto a screen
  // that is already leaving. Both the mount guard and the join handler can fire.
  const leaving = useRef(false);

  /**
   * UX-COMM-06: the community "opens in member mode as a full screen [and]
   * becomes the selected community in the header switcher". The switcher reads
   * the default, so recording it IS the selection. A failure to record it is not
   * worth blocking on — the tab still opens, on whatever was active before.
   */
  const enterCommunity = async () => {
    if (leaving.current) return;
    leaving.current = true;
    await setDefault.mutateAsync(id).catch(() => {});
    router.replace('/(tabs)/community');
  };

  /**
   * A member who lands here — a stale link, a deep link, or the frame after a
   * join resolves — belongs in the tab, not on a preview of a community they
   * are already in. In an effect rather than in render: navigating and writing
   * `leaving` are both side effects, and the compiler rules reject those in a
   * render body outright.
   */
  const isMember = standing?.state === 'member';
  useEffect(() => {
    if (isMember) void enterCommunity();
    // `enterCommunity` closes over the router and the mutation, neither of which
    // changes identity in a way that should re-run this; `leaving` guards a
    // second call regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMember]);

  const busy =
    join.isPending ||
    cancelRequest.isPending ||
    acceptInvitation.isPending ||
    declineInvitation.isPending;

  if (isLoading || standingLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="edit" onClose={() => router.back()} />
        <Loading />
      </SafeAreaView>
    );
  }

  if (isError || !community) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="edit" onClose={() => router.back()} />
        <Screen padded style={styles.notFound}>
          <Text variant="heading">{t('notFoundTitle')}</Text>
          <Text variant="body" tone="muted" style={styles.centred}>
            {t('notFoundBody')}
          </Text>
        </Screen>
      </SafeAreaView>
    );
  }

  const state = standing?.state ?? 'none';
  const action = previewAction(state, community.privacy);
  const rulesGated =
    community.cancellation_rules_enabled && !!community.cancellation_rules_text;
  const ackRequired = rulesGated && actionNeedsAck(action);
  const blockedByAck = ackRequired && !ack;

  /**
   * The roster is readable to a member, and to anyone at all only when the
   * community is PUBLIC (`community_members: read`, migration 0024). For a
   * request-to-join or private community an outsider gets an empty array back —
   * that is row-level security, not an empty community, and rendering it as "0
   * members" would state something false about a community with fifty. Null
   * makes the card show "—", and the admins section simply does not appear.
   *
   * UX-COMM-04 does want the count on a request-to-join preview. That needs the
   * same read widening the tabs are waiting on, so it arrives with them.
   */
  const rosterReadable = community.privacy === 'public' || state === 'member';
  const memberCount = membersError || !rosterReadable ? null : (members?.length ?? 0);
  const admins = rosterReadable ? (members ?? []).filter((m) => m.role === 'admin') : [];
  const cover = coverUrl(community.cover_image_path);

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    if (code === 'community_full') {
      // The joiner is by definition not yet a member, so they cannot act on the
      // community's plan — UpgradePrompt shows the message with an OK close.
      setShowUpgrade(true);
      return;
    }
    setErrorKey(KNOWN_ERROR_KEYS.has(code) ? code : 'unknown_error');
  };

  const onJoin = async () => {
    setErrorKey(null);
    try {
      const result = await join.mutateAsync(ack);
      if (result === 'joined') {
        banner.show(t('joinedToast'), 'success');
        await enterCommunity();
      } else {
        // 'requested' — the standing query now answers 'requested' and the
        // action below becomes the cancellable "Requested" state.
        banner.show(t('requestedToast'), 'success');
      }
    } catch (e) {
      fail(e);
    }
  };

  const onCancelRequest = async () => {
    setErrorKey(null);
    try {
      await cancelRequest.mutateAsync();
      banner.show(t('requestCancelledToast'), 'success');
    } catch (e) {
      fail(e);
    }
  };

  const onAccept = async () => {
    setErrorKey(null);
    const invitationId = standing?.invitation?.id;
    if (!invitationId) return;
    try {
      await acceptInvitation.mutateAsync({ invitationId, communityId: id, ack });
      banner.show(t('joinedToast'), 'success');
      await enterCommunity();
    } catch (e) {
      fail(e);
    }
  };

  const onDecline = async () => {
    setErrorKey(null);
    const invitationId = standing?.invitation?.id;
    if (!invitationId) return;
    try {
      await declineInvitation.mutateAsync({ invitationId, communityId: id });
      banner.show(t('invitationDeclinedToast'), 'success');
      router.back();
    } catch (e) {
      fail(e);
    }
  };

  const inviter = standing?.invitation?.inviter;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" onClose={() => router.back()} />

      <Screen scroll style={styles.content} testID="community-preview">
        <View style={styles.identity}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={styles.cover}
              contentFit="cover"
              transition={150}
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
          memberCount={memberCount}
        />

        {community.description ? (
          <Text variant="body">{community.description}</Text>
        ) : null}

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

        {admins.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" tone="muted">
              {t('aboutAdminsLabel')}
            </Text>
            {admins.map((a) => (
              <ListRow
                key={a.user_id}
                title={a.profiles?.full_name ?? '—'}
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
            ))}
          </View>
        ) : null}

        <View style={styles.factRow}>
          <Text variant="label" tone="muted">
            {t('aboutCreatedLabel')}
          </Text>
          <Text variant="label" style={styles.factValue}>
            {new Date(community.created_at).toLocaleDateString()}
          </Text>
        </View>

        {/* The plain-language privacy line (UX-COMM-04) — the rule in words, under the facts. */}
        <Text variant="caption" tone="muted">
          {t(PRIVACY_SUMMARY_KEY[community.privacy] ?? 'privacySummaryPublic')}
        </Text>
      </Screen>

      {/*
        The action is PINNED (UX-COMM-04: "the join action fixed at the bottom
        while content scrolls"), so it is outside the scroller and carries the
        bottom inset itself — `Screen` deliberately applies no safe area.
      */}
      {action === 'none' ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[4] }]}>
          {action === 'invited' && inviter ? (
            <Card padding="sm">
              <View style={styles.inviter}>
                <Avatar
                  uri={avatarUrl(inviter.avatar_url)}
                  name={inviter.full_name}
                  colourKey={inviter.id}
                  size="md"
                  decorative
                />
                <Text variant="label" numberOfLines={2} style={styles.inviterName}>
                  {t('invitedBy', { name: inviter.full_name ?? '—' })}
                </Text>
              </View>
            </Card>
          ) : null}

          {ackRequired ? (
            <AckGate
              value={ack}
              onChange={setAck}
              rulesText={community.cancellation_rules_text ?? ''}
            />
          ) : null}

          {errorKey ? (
            <Text variant="label" tone="destructive" accessibilityRole="alert">
              {t(errorKey)}
            </Text>
          ) : null}

          {action === 'invited' ? (
            <View style={styles.pair}>
              <Button
                label={t('declineInvite')}
                variant="outline"
                style={styles.pairItem}
                disabled={busy}
                loading={declineInvitation.isPending}
                onPress={() => void onDecline()}
                testID="community-decline"
              />
              <Button
                label={t('acceptInvite')}
                style={styles.pairItem}
                disabled={busy || blockedByAck}
                loading={acceptInvitation.isPending}
                onPress={() => void onAccept()}
                testID="community-accept"
              />
            </View>
          ) : action === 'requested' ? (
            /*
              UX-COMM-04: "becomes 'Requested' once tapped, tapping again
              cancels". It stays a live control rather than going disabled —
              disabled would read as "pending, nothing you can do", which is the
              opposite of what it now does.
            */
            <Button
              label={t('requestedCta')}
              variant="outline"
              fullWidth
              disabled={busy}
              loading={cancelRequest.isPending}
              onPress={() => void onCancelRequest()}
              testID="community-cancel-request"
            />
          ) : (
            <Button
              label={action === 'request' ? t('requestCta') : t('joinCta')}
              fullWidth
              disabled={busy || blockedByAck}
              loading={join.isPending}
              onPress={() => void onJoin()}
              testID="community-join"
            />
          )}
        </View>
      )}

      <UpgradePrompt
        visible={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        communityId={id}
        message={t('upgradeMembersCap')}
        canManage={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: space[4], paddingVertical: space[4] },
  notFound: { gap: space[2], alignItems: 'center', justifyContent: 'center' },
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
  footer: {
    gap: space[3],
    paddingHorizontal: space[5],
    paddingTop: space[4],
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  inviterName: { flexShrink: 1 },
  pair: { flexDirection: 'row', gap: space[3] },
  pairItem: { flex: 1 },
});
