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
  useCommunityMemberCount,
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
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AckGate } from '@/components/community/AckGate';
import { CommunityAttributes } from '@/components/community/CommunityAttributes';
import { CommunityIdProvider } from '@/components/community/CommunityIdContext';
import {
  actionNeedsAck,
  PREVIEW_TAB_KEY,
  PREVIEW_TABS,
  previewAction,
  previewHasTabs,
  type PreviewTab,
} from '@/components/community/previewAction';
import CommunityEventsTab from '@/components/community/tabs/Events';
import CommunityGroupsTab from '@/components/community/tabs/Groups';
import CommunityMembersTab from '@/components/community/tabs/Members';
import CommunityPostsTab from '@/components/community/tabs/Posts';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { avatarUrl, coverUrl, thumbnailUrl } from '@/lib/community-images';
import { colors, radius, space } from '../../../theme';
import {
  Avatar,
  Button,
  Card,
  Chip,
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
  const { data: memberCountData, isError: memberCountError } = useCommunityMemberCount(id);
  const { data: standing, isLoading: standingLoading } = useCommunityStanding(id);

  const join = useJoinCommunity(id);
  const cancelRequest = useCancelJoinRequest(id);
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();
  const setDefault = useSetDefaultCommunity();

  const [ack, setAck] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // About is the default (UX-COMM-04) and the only tab every privacy mode shows.
  const [tab, setTab] = useState<PreviewTab>('about');
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
   * The COUNT comes from the server (migration 0100), the NAMES from the roster.
   *
   * They are separate on purpose. `community_members: read` (0024) gives an outsider the roster
   * of a public community and an empty array for the other two modes — RLS, not an empty
   * community — so counting rows here would print a confident "0" for a request-to-join
   * community with fifty people in it. `community_member_count` answers the number for any
   * community without disclosing who is in it, which is exactly what the attribute card needs.
   *
   * The admins list still depends on the roster, so it appears only where the names are
   * genuinely readable. That is the audit's shape too: attribute widgets on every preview, the
   * admin rows only where there is something to show.
   */
  const rosterReadable = community.privacy === 'public' || state === 'member';
  /**
   * The RPC first, the roster as a fallback where the roster is readable at all.
   *
   * The fallback is not redundant: `community_member_count` ships in migration
   * 0100, and until that is applied to a given database the RPC simply is not
   * there. On a public community the roster answers the same question, so the
   * card shows a number rather than "—" for a gap the viewer cannot see.
   */
  const rosterCount = rosterReadable && !membersError ? (members?.length ?? null) : null;
  const memberCount = memberCountError ? rosterCount : (memberCountData ?? rosterCount);
  const admins = rosterReadable && !membersError ? (members ?? []).filter((m) => m.role === 'admin') : [];
  const hasTabs = previewHasTabs(community.privacy);
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

      {/*
        UX-COMM-04 gives a PUBLIC community's preview all five tabs; the other two
        privacy modes get About alone. That line is also exactly what migration 0100
        made readable to a non-member, which is not a coincidence — a tab whose
        queries RLS refuses renders an empty state indistinguishable from an empty
        community, which is worse than no tab.

        Chips rather than Material Top Tabs: those need a route layout, and the
        preview is one screen. `Chip` also carries accessibilityState.selected,
        which colour alone would not and the E2E tree reads.
      */}
      {hasTabs ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabStrip}
          style={styles.tabStripOuter}
        >
          {PREVIEW_TABS.map((key) => (
            <Chip
              key={key}
              label={t(PREVIEW_TAB_KEY[key])}
              selected={tab === key}
              onPress={() => setTab(key)}
              testID={`preview-tab-${key}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {tab !== 'about' ? (
        /*
          The member view's own tab components, rendered directly rather than through
          the router. Each reads its community from CommunityIdContext and gates every
          create affordance on `useAbility` / `can_create_*`, which a non-member fails —
          so they come up read-only here without a preview-specific variant to keep in
          step with them.
        */
        <CommunityIdProvider id={id}>
          <View style={styles.pane}>
            {tab === 'posts' ? <CommunityPostsTab /> : null}
            {tab === 'events' ? <CommunityEventsTab /> : null}
            {tab === 'groups' ? <CommunityGroupsTab /> : null}
            {tab === 'members' ? <CommunityMembersTab /> : null}
          </View>
        </CommunityIdProvider>
      ) : (
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
      )}

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
  // `flexGrow: 0` so the strip is as tall as a chip, not a third of the screen —
  // a horizontal ScrollView inside a flex column otherwise takes what it is given (#138).
  tabStripOuter: { flexGrow: 0, backgroundColor: colors.card },
  tabStrip: { gap: space[2], paddingHorizontal: space[5], paddingVertical: space[3] },
  pane: { flex: 1 },
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
