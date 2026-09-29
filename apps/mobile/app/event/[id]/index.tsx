/**
 * The event page (UX-JEVT-02..07). One body for every viewer; only the top banner and the fixed
 * bottom area change with the viewer's state (see `@padel/utils` eventViewerState for the table).
 *
 *   header      back · ⋯ (Share, Add to calendar, Leave event). The organizer gets the settings
 *               icon (→ Manage Event, UX-MEVT-03) instead, and both side by side when they play.
 *   status      organizer only (UX-MEVT-01): "You are organizing" + Join as a player, or
 *               "You are organizing and going!"
 *   banner      You are going / stand-by / waiting list / interested
 *   body        image, name + date · time · place, Players card, type + group badges,
 *               description, Courts / Scoring / Fee, Organizer card, Location card — the same for
 *               the organizer, who also gets a "Manage players" row and a chip row (Payment
 *               list, Send blast, Preferences)
 *   bottom      invited · join (+ countdown) · full · waiting list (+ Confirm spot when one is
 *               free — decision 4) · closed · organizer actions · team entry (Join → the Team Event
 *               sheet, UX-JEVT-09) · interested (Edit response, UX-JEVT-13)
 *
 * Team events: "Join", an invitee's "Accept" and the organizer's "Join as a player" all open the
 * Team Event sheet — I have a partner (`have-partner`, UX-JEVT-10) or I need a partner
 * (`need-partner`, UX-JEVT-11). Those screens do the confirming; accepting a team invitation never
 * silently marks anyone interested (B9).
 *
 * Leaving is never in the bottom area: it lives in the ⋯ sheet, and past the 12h deadline it
 * opens the contact-the-organizer sheet instead (UX-JEVT-05).
 */
import {
  eventStatusKey,
  useAcceptEventInvitation,
  useClaimWaitlistSpot,
  useDeclineEventInvitation,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventRealtime,
  useEventSeries,
  useEventTeams,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
  useMyProfile,
  useEnsureChannel,
  useMaterializeOccurrence,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import {
  bannerState,
  bottomState,
  canClaimWaitlistSpot,
  canLeave,
  eventPlace,
  formatCountdown,
  joinWaitlistReason,
  mapsQuery,
  participationState,
  showJoinCountdown,
} from '@padel/utils';
import { SymbolView } from 'expo-symbols';
import { useIsFocused, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { streamClient } from '@/lib/streamClient';
import { useNow } from '@/lib/useNow';
import { useGoBack } from '@/lib/useGoBack';
import { pendingActions } from '@/lib/pendingActions';
import { avatarUrl } from '@/lib/community-images';
import { addToCalendar } from '@/lib/eventCalendar';
import { openInMaps } from '@/lib/eventLocation';
import { eventSubtitle, eventWhen } from '@/lib/eventFormat';
import { shareEvent } from '@/lib/eventShare';
import { PendingActionsSheet } from '../../../components/event/PendingActionsSheet';
import { useStartFlow } from '../../../components/event/manage/useStartFlow';
import {
  EditResponseSheet,
  TeamEventSheet,
  type EditChoice,
  type TeamChoice,
} from '../../../components/event/TeamSheets';
import { EventThumb } from '../../../components/event/EventThumb';
import {
  InfoWidgets,
  LeaveLockedSheet,
  LocationCard,
  PersonCard,
  PlayersCard,
  StateBanner,
} from '../../../components/event/EventDetailParts';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  emptyIcon,
  Text,
  TopBar,
  useActionSheet,
  useBanner,
  useConfirm,
} from '../../../components/ui';

/** Capitalize the first character of a raw enum value (rest left untouched). */
function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function EventDetailScreen() {
  const { t, i18n } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const showSheet = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();

  const { t: tcommon } = useT('common');
  // Live roster, so a freed spot shows "Confirm spot" without leaving the page. Only while this
  // page is focused: the live screen pushed on top subscribes to the same event itself.
  const focused = useIsFocused();
  useEventRealtime(id, { enabled: focused });
  const { data: event, isLoading, isError, refetch } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const { data: invitationsData } = useEventInvitations(id);
  const { data: teamsData } = useEventTeams(id);
  const { data: series } = useEventSeries(id);
  // Only a mixed event reads it: the viewer's own gender decides whose waiters queue ahead of them.
  const { data: myProfile, isLoading: myProfileLoading } = useMyProfile();

  const joinEvent = useJoinEvent();
  const leaveEvent = useLeaveEvent();
  const leaveWaitingList = useLeaveWaitingList(id);
  const claimWaitlistSpot = useClaimWaitlistSpot(id);
  const acceptInvitation = useAcceptEventInvitation();
  const declineInvitation = useDeclineEventInvitation(id);
  const startFlow = useStartFlow(id, event);
  const ensureChannel = useEnsureChannel();
  const materialize = useMaterializeOccurrence(id);

  const [busy, setBusy] = useState(false);
  const [lockedSheetOpen, setLockedSheetOpen] = useState(false);
  const [teamSheetOpen, setTeamSheetOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  // One native calendar editor at a time: a second tap while it is opening would be rejected.
  const [calendarBusy, setCalendarBusy] = useState(false);

  // Ticking clock so the join countdown + deadline-gated CTAs stay live.
  const nowMs = useNow();

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // A failed request is not "no access" (that is RLS answering with no row): offer a retry.
  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} />
        <EmptyState
          fill
          tone="error"
          title={tcommon('loadError')}
          action={{ label: tcommon('retry'), onPress: () => void refetch() }}
          testID="event-load-error"
        />
      </SafeAreaView>
    );
  }

  // --- No access (UX-JEVT-07). RLS hides a private event AND a deleted one the same way, so both
  // land here. ✕ goes Home, not back: this screen is usually reached from a link.
  if (event == null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="edit" onClose={() => router.replace('/(tabs)')} />
        <EmptyState
          fill
          icon={emptyIcon('lock.fill')}
          title={t('noAccessTitle')}
          body={t('noAccessBody')}
          testID="event-no-access"
        />
      </SafeAreaView>
    );
  }

  const participants = participantsData ?? [];
  const invitations = invitationsData ?? [];
  const ps = participationState(event, participants, invitations, uid, nowMs);
  const { me, myInvite, isOrganizer, joinClosed, leaveLocked, joinCutoffMs } = ps;
  const status = event.status;

  // --- Pending actions: the server counts status='confirmed' regardless of is_standby ---
  const startConfirmedCount = participants.filter((p) => p.status === 'confirmed').length;
  const confirmedTeamCount = (teamsData ?? []).filter((tm) => tm.is_confirmed).length;

  // --- Body values ---
  const lang = i18n.language;
  const place = eventPlace(event);
  const typeLabel = t(`type${cap(event.event_type)}Label`);
  const specLabel = t(`spec${cap(event.specification)}Label`);
  const scoringLabel = t(`scoring${cap(event.scoring_mode)}Label`);
  const scoringText =
    event.scoring_mode === 'classic' ? scoringLabel : `${scoringLabel} · ${event.scoring_value}`;
  const feeText = event.entrance_fee_enabled
    ? event.entrance_fee_method != null
      ? `${event.entrance_fee_amount ?? 0} · ${t(`fee${cap(event.entrance_fee_method)}Label`)}`
      : `${event.entrance_fee_amount ?? 0}`
    : t('feeFree');

  // Confirmed regulars first, then standby: the three photos are the people surely playing.
  const confirmedPeople = participants
    .filter((p) => p.status === 'confirmed')
    .sort((a, b) => Number(a.is_standby) - Number(b.is_standby))
    .map((p) => ({
      id: p.profiles?.id ?? p.id,
      name: p.profiles?.full_name ?? p.guest_name ?? null,
      uri: avatarUrl(p.profiles?.avatar_url),
    }));

  // Only non-scheduled statuses get a badge: "Upcoming" said nothing (UX-JEVT-01).
  const statusBadge = eventStatusKey(status, event.starts_at);

  // --- Recurring series (5G-6 + A1): tag + clickable next-occurrence card ---
  // The card must show EXACTLY what materialize_occurrence creates: source.starts_at + 7 days.
  const isRecurring = event.series_id != null && series != null && series.is_active;
  const nextOccurrenceIso = isRecurring
    ? new Date(new Date(event.starts_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const hasOwnChat = event.is_private || event.group_id == null;

  // --- Viewer state ---
  // Decision 4: nobody is confirmed automatically — when a spot frees, every waiter who could take
  // it is offered it and the first to confirm wins. Mirrors the server's _waiter_can_claim.
  const claimable =
    status === 'scheduled' &&
    !joinClosed &&
    canClaimWaitlistSpot(event.specification, ps.totalCapacity, participants, me);
  // Decision 4: while anyone who could take the spot is waiting, a newcomer's Join queues behind
  // them — so the bottom area says "Join waiting list" then too, not only when the event is full.
  // A mixed event needs the viewer's gender: until the profile arrives, answer nothing rather than
  // a wrong "Join waiting list" from counting every waiter.
  const waitlistReason =
    event.specification === 'mixed' && myProfileLoading
      ? null
      : joinWaitlistReason(event.specification, ps.totalCapacity, participants, myProfile?.gender);
  const bottom = bottomState({
    status,
    specification: event.specification,
    isOrganizer,
    me,
    hasInvite: myInvite != null,
    joinClosed,
    full: waitlistReason != null,
    waitersAhead: waitlistReason === 'waiters',
    countdown: showJoinCountdown(joinCutoffMs, nowMs),
    claimable,
  });
  const bannerKind = bannerState(status, me);
  // Decision 1: a team player whose partner left is back to `invited`, holding no spot — for the
  // organizer too, who then sees "Join as a player" again rather than "organizing and playing".
  const loneTeamOccupant = event.specification === 'team' && me?.status === 'invited';
  const leaveOffered = canLeave(status, me, isOrganizer, leaveLocked);
  // UX-MEVT-01: which of the organizer's two states applies, and whether the status line offers
  // "Join as a player" (decision 8: the organizer is always eligible, whatever the role chosen at
  // creation). "Start event" is the primary action here only once the scheduled time has come;
  // before that it lives in Manage Event.
  const organizerGoing = isOrganizer && me?.status === 'confirmed' && !loneTeamOccupant;
  const organizerCanJoin =
    isOrganizer && status === 'scheduled' && !joinClosed && (me == null || loneTeamOccupant);
  const startHere = isOrganizer && status === 'scheduled' && nowMs >= new Date(event.starts_at).getTime();

  // --- Actions ---
  const fail = (e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const openJoined = () => router.push(`/event/${id}/joined` as Href);
  const onJoin = () =>
    run(async () => {
      const result = await joinEvent.mutateAsync({ eventId: id, groupId: event.group_id });
      // A Join the server queued (full, or others waiting) says so rather than nothing.
      if (result === 'confirmed') openJoined();
      else if (result === 'waiting_list') banner.show(t('joinedWaitlistToast'), 'success');
    });
  // A team invitation is answered by setting a team (B9): the chosen path does the confirming.
  const onAccept = () => {
    if (event.specification === 'team') {
      setTeamSheetOpen(true);
      return;
    }
    void run(async () => {
      const result = await acceptInvitation.mutateAsync({ eventId: id, groupId: event.group_id });
      if (result === 'confirmed') openJoined();
      else if (result === 'waiting_list') banner.show(t('joinedWaitlistToast'), 'success');
    });
  };
  const onDecline = () => run(() => declineInvitation.mutateAsync());
  // A waiting PAIR leaves together (leave_waiting_list drops the partner, 0112): confirm first.
  const onLeaveWaitlist = async () => {
    if (me?.pair_participant_id != null) {
      const ok = await confirm({
        title: t('leaveWaitlistCta'),
        body: t('leaveTeamConfirmBody'),
        confirmLabel: t('leaveWaitlistCta'),
        destructive: true,
      });
      if (!ok) return;
    }
    await run(() => leaveWaitingList.mutateAsync());
  };
  // spot_taken (someone confirmed first), gender_full (mixed: the free spot is in the other half)
  // and use_team_join (a team waiter whose pair broke up) come back as banners via `fail`.
  // On a claim, use_team_join means the viewer's waiting partner is gone (only a pair claims a
  // team spot), so say that rather than the generic "join via your team".
  const onClaim = () =>
    run(async () => {
      try {
        await claimWaitlistSpot.mutateAsync();
      } catch (e) {
        throw e instanceof Error && e.message === 'use_team_join' ? new Error('claimPartnerLeft') : e;
      }
      openJoined();
    });
  const onLeave = () =>
    run(async () => {
      await leaveEvent.mutateAsync({ eventId: id, groupId: event.group_id });
      banner.show(t('leftToast'), 'success');
    });
  const onTeamChoice = (c: TeamChoice) =>
    router.push(`/event/${id}/${c === 'have' ? 'have-partner' : 'need-partner'}` as Href);
  // UX-JEVT-13. Leave cancels every request the player sent (leave_event, 0111/0112).
  const onEditChoice = async (c: EditChoice) => {
    if (c !== 'leave') return onTeamChoice(c);
    // The organizer never gets here past the deadline (the row is hidden — canLeave), but never
    // send them to contact themselves either way.
    if (leaveLocked && isOrganizer) return banner.show(t('leave_deadline_passed'));
    if (leaveLocked) return setLockedSheetOpen(true);
    const ok = await confirm({
      title: t('leaveConfirmTitle'),
      body: t('leaveInterestedBody'),
      confirmLabel: t('leaveConfirmCta'),
      destructive: true,
    });
    if (ok) await onLeave();
  };
  // A blocked start answers the tap with its reason (UX-GLOB-06) rather than a disabled button.
  const onStart = () => {
    if (startFlow.blocker) return banner.show(startFlow.blocker);
    return run(async () => {
      await startFlow.start();
      router.push(`/event/${id}/live` as Href);
    });
  };
  const onOpenNextOccurrence = () =>
    run(async () => {
      const newId = await materialize.mutateAsync();
      router.push(`/event/${newId}/manage` as Href);
    });
  const openEventChat = async () => {
    if (ensureChannel.isPending) return;
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'event', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      /* surfaced via ensureChannel.isError below */
    }
  };
  // A 1:1 channel with the organizer, created client-side (unchanged from the old contact row).
  const onMessageOrganizer = () => {
    setLockedSheetOpen(false);
    return run(async () => {
      const channel = streamClient.channel('messaging', { members: [uid!, event.organizer_id] });
      await channel.watch();
      router.push(('/chat/' + channel.cid) as never);
    });
  };

  const onAddToCalendar = async () => {
    if (calendarBusy) return;
    setCalendarBusy(true);
    const result = await addToCalendar({
      title: event.name,
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      location: place ? mapsQuery(place) : null,
      notes: event.description,
    }).finally(() => setCalendarBusy(false));
    if (result === 'denied') banner.show(t('calendarDenied'));
    else if (result === 'error') banner.show(t('calendarError'));
  };

  // UX-JEVT-06. Leave is confirmed by the sheet itself before the deadline; after it, the row
  // opens the contact-the-organizer sheet instead of asking anything (`selfConfirm`).
  const onMore = async () => {
    const key = await showSheet({
      actions: [
        { key: 'share', label: t('shareAction') },
        { key: 'calendar', label: t('addToCalendarAction') },
        ...(leaveOffered
          ? [
              leaveLocked
                ? { key: 'leave', label: t('leaveCta'), destructive: true, selfConfirm: true }
                : {
                    key: 'leave',
                    label: t('leaveCta'),
                    destructive: true,
                    confirm: {
                      title: t('leaveConfirmTitle'),
                      // Decision 1: on a team event the partner loses their spot too, and is told.
                      body: t(
                        event.specification === 'team' && me?.status === 'confirmed'
                          ? 'leaveTeamConfirmBody'
                          : 'leaveConfirmBody',
                      ),
                      confirmLabel: t('leaveConfirmCta'),
                    },
                  },
            ]
          : []),
      ],
    });
    if (key === 'share') await shareEvent(id, event.name).catch(() => undefined);
    else if (key === 'calendar') await onAddToCalendar();
    else if (key === 'leave') {
      if (leaveLocked) setLockedSheetOpen(true);
      else await onLeave();
    }
  };

  const organizer = event.organizer;
  const inviter = myInvite?.inviter ?? null;

  // --- Bottom area ---
  let bottomArea: React.ReactNode = null;
  switch (bottom.kind) {
    case 'live':
      bottomArea = (
        <Button
          label={bottom.completed ? t('viewResultsCta') : t('viewMatchesCta')}
          fullWidth
          disabled={busy}
          onPress={() => router.push(`/event/${id}/live` as Href)}
        />
      );
      break;
    case 'organizer': {
      // UX-MEVT-01: management lives in the header and Manage Event; Join as a player sits in the
      // status line. What is left here is Start event (from the scheduled time) and the organizer's
      // own player states.
      const rows: React.ReactNode[] = [];
      if (status === 'scheduled') {
        if (startHere) {
          rows.push(
            <Button key="start" label={t('startCta')} fullWidth loading={busy} onPress={onStart} testID="event-start" />,
          );
        }
        // An organizer who plays and is still looking for a partner (UX-JEVT-13).
        if (me?.status === 'interested' && !joinClosed) {
          rows.push(
            <Button
              key="edit"
              label={t('editResponseCta')}
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => setEditSheetOpen(true)}
              testID="event-edit-response"
            />,
          );
        }
        // An organizer who tried to play on a full event is waiting like anyone else.
        if (me?.status === 'waiting_list' && claimable) {
          rows.push(<Button key="claim" label={t('confirmSpotCta')} fullWidth loading={busy} onPress={onClaim} />);
        }
        if (me?.status === 'waiting_list') {
          rows.push(
            <Button
              key="leave"
              label={t('leaveWaitlistCta')}
              variant="secondary"
              fullWidth
              loading={busy}
              onPress={onLeaveWaitlist}
            />,
          );
        }
      }
      bottomArea = rows.length > 0 ? <View style={styles.col}>{rows}</View> : null;
      break;
    }
    case 'invited':
      bottomArea = (
        <View style={styles.col}>
          <View style={styles.inviterRow} testID="event-inviter">
            {inviter ? (
              <Avatar
                uri={avatarUrl(inviter.avatar_url)}
                name={inviter.full_name}
                colourKey={inviter.id}
                size="sm"
                decorative
              />
            ) : null}
            <Text variant="bodyStrong" style={styles.flex}>
              {inviter?.full_name ? t('invitedBanner', { name: inviter.full_name }) : t('invitedBannerGeneric')}
            </Text>
          </View>
          <View style={styles.row}>
            <Button label={t('declineCta')} variant="secondary" loading={busy} onPress={onDecline} style={styles.flex} />
            <Button label={t('acceptCta')} loading={busy} onPress={onAccept} style={styles.flex} />
          </View>
        </View>
      );
      break;
    case 'open':
      bottomArea = (
        <View style={styles.row}>
          {bottom.countdown ? (
            <Text variant="label" tone="primary" style={styles.flex} testID="event-join-countdown">
              {t('joinCountdown', { time: formatCountdown(joinCutoffMs - nowMs) })}
            </Text>
          ) : null}
          <Button label={t('joinCta')} loading={busy} onPress={onJoin} style={styles.flex} />
        </View>
      );
      break;
    case 'full':
      bottomArea = (
        <View style={styles.row}>
          <Text variant="label" tone="muted" style={styles.flex}>
            {t(bottom.waitersAhead ? 'waitersAheadLine' : 'noSpotsLine')}
          </Text>
          <Button label={t('waitlistCta')} loading={busy} onPress={onJoin} style={styles.flex} />
        </View>
      );
      break;
    case 'waiting_list':
      bottomArea = (
        <Button label={t('leaveWaitlistCta')} variant="secondary" fullWidth loading={busy} onPress={onLeaveWaitlist} />
      );
      break;
    case 'claim':
      bottomArea = (
        <View style={styles.col}>
          <Text variant="label" tone="primary" style={styles.centerText} testID="event-spot-open">
            {t('spotOpenLine')}
          </Text>
          <View style={styles.row}>
            <Button
              label={t('leaveWaitlistCta')}
              variant="secondary"
              loading={busy}
              onPress={onLeaveWaitlist}
              style={styles.flex}
            />
            <Button label={t('confirmSpotCta')} loading={busy} onPress={onClaim} style={styles.flex} />
          </View>
        </View>
      );
      break;
    case 'team_entry':
      // UX-JEVT-09: "Join" like any event; whether you have a partner is the next question.
      bottomArea = (
        <View style={styles.row}>
          {showJoinCountdown(joinCutoffMs, nowMs) ? (
            <Text variant="label" tone="primary" style={styles.flex} testID="event-join-countdown">
              {t('joinCountdown', { time: formatCountdown(joinCutoffMs - nowMs) })}
            </Text>
          ) : null}
          <Button
            label={t('joinCta')}
            disabled={busy}
            onPress={() => setTeamSheetOpen(true)}
            style={styles.flex}
            testID="event-team-join"
          />
        </View>
      );
      break;
    case 'interested':
      bottomArea = (
        <View style={styles.col}>
          <Text variant="caption" tone="muted" style={styles.centerText}>
            {t('interestedLine')}
          </Text>
          <Button
            label={t('editResponseCta')}
            fullWidth
            disabled={busy}
            onPress={() => setEditSheetOpen(true)}
            testID="event-edit-response"
          />
        </View>
      );
      break;
    case 'closed':
      bottomArea = (
        <Text variant="label" tone="muted" style={[styles.centerText, styles.closedLine]}>
          {t('eventClosedLine')}
        </Text>
      );
      break;
    case 'going':
      bottomArea = null;
      break;
  }

  // A team event announces itself (UX-JEVT-09): the format badge names the team format.
  const badges = [
    event.specification === 'team' ? `${typeLabel} · ${t('teamFormatBadge')}` : `${typeLabel} · ${specLabel}`,
    event.group?.name ?? (event.group_id == null ? t('groupBadgeNone') : null),
  ].filter((b): b is string => b != null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        actions={[
          ...(isOrganizer
            ? [
                {
                  icon: (
                    <SymbolView
                      name={{ ios: 'gearshape', android: 'settings', web: 'settings' } as never}
                      tintColor={colors.foreground}
                      size={22}
                    />
                  ),
                  label: t('manageEventTitle'),
                  onPress: () => router.push(`/event/${id}/manage` as Href),
                  testID: 'event-settings',
                },
              ]
            : []),
          // The organizer who only organizes has nothing to leave; Share and Add to calendar are
          // on Manage Event for them.
          ...(!isOrganizer || me != null
            ? [
                {
                  icon: (
                    <SymbolView
                      name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_vert' } as never}
                      tintColor={colors.foreground}
                      size={22}
                    />
                  ),
                  label: t('moreActionsLabel'),
                  onPress: () => void onMore(),
                  testID: 'event-more',
                },
              ]
            : []),
        ]}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {isOrganizer ? (
          <View style={[styles.section, styles.statusLine]}>
            <Text variant="bodyStrong" style={styles.flex} testID="event-organizer-status">
              {organizerGoing ? t('organizerPlayingBadge') : t('organizerBadge')}
            </Text>
            {organizerCanJoin ? (
              <Button
                label={t('joinAsPlayerCta')}
                variant="secondary"
                size="sm"
                loading={busy}
                onPress={event.specification === 'team' ? () => setTeamSheetOpen(true) : onJoin}
                testID="event-join-as-player"
              />
            ) : null}
          </View>
        ) : null}
        {/* The organizer's status line already says "going". */}
        {bannerKind && !(isOrganizer && bannerKind === 'going') ? <StateBanner state={bannerKind} /> : null}

        <View style={styles.section}>
          <EventThumb path={event.thumbnail_path} shape="hero" />
        </View>

        {/* Identity */}
        <View style={styles.section}>
          <Text variant="title" accessibilityRole="header">
            {event.name}
          </Text>
          <Text variant="body" tone="muted" style={styles.subtitle}>
            {eventSubtitle(event.starts_at, place?.name, lang)}
          </Text>
          {statusBadge !== 'statusScheduled' || isRecurring ? (
            <View style={styles.badges}>
              {statusBadge !== 'statusScheduled' ? (
                <Badge
                  label={t(statusBadge)}
                  tone={statusBadge === 'statusInProgress' ? 'success' : statusBadge === 'statusStartingNow' ? 'warning' : 'neutral'}
                />
              ) : null}
              {isRecurring ? <Badge label={t('recurrentTag')} tone="primary" /> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <PlayersCard
            people={confirmedPeople}
            confirmed={ps.totalIn}
            capacity={ps.totalCapacity}
            onPress={() => router.push(`/event/${id}/players` as Href)}
          />
        </View>

        {isOrganizer ? (
          <>
            <View style={styles.section}>
              <PlayersCard
                title={t('managePlayersTitle')}
                people={confirmedPeople}
                confirmed={ps.totalIn}
                capacity={ps.totalCapacity}
                onPress={() => router.push(`/event/${id}/manage-players` as Href)}
                testID="event-manage-players"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {event.entrance_fee_enabled ? (
                <Chip
                  label={t('paymentListTitle')}
                  onPress={() => router.push(`/event/${id}/payments` as Href)}
                  testID="event-chip-payments"
                />
              ) : null}
              <Chip
                label={t('sendBlastCta')}
                onPress={() => router.push(`/event/${id}/blast` as Href)}
                testID="event-chip-blast"
              />
              {status === 'scheduled' ? (
                <Chip
                  label={t('step8Title')}
                  onPress={() => router.push(`/event/${id}/manage?sheet=preferences` as Href)}
                  testID="event-chip-preferences"
                />
              ) : null}
            </ScrollView>
          </>
        ) : null}

        <View style={[styles.section, styles.badges]}>
          {badges.map((b) => (
            <Badge key={b} label={b} tone="primary" />
          ))}
        </View>

        {event.description ? (
          <View style={styles.section}>
            <Text variant="body">{event.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <InfoWidgets
            items={[
              { label: t('widgetCourts'), value: String(event.num_courts) },
              { label: t('widgetScoring'), value: scoringText },
              { label: t('widgetFee'), value: feeText },
            ]}
          />
        </View>

        {nextOccurrenceIso ? (
          <View style={styles.section}>
            <Card onPress={isOrganizer ? onOpenNextOccurrence : undefined} testID="event-next-occurrence">
              <Text variant="label" tone="muted">
                {t('nextOccurrenceTitle')}
              </Text>
              <Text variant="bodyStrong">{eventWhen(nextOccurrenceIso, lang)}</Text>
              {isOrganizer ? (
                <Text variant="caption" tone="muted">
                  {materialize.isPending ? t('materializeOccurrenceLoading') : t('materializeOccurrenceHint')}
                </Text>
              ) : null}
            </Card>
          </View>
        ) : null}

        {organizer ? (
          <View style={styles.section}>
            <PersonCard
              person={organizer}
              caption={t('organizerLabel')}
              onPress={() => router.push(`/profile/${organizer.id}` as Href)}
              testID="event-organizer-card"
            />
          </View>
        ) : null}

        {place ? (
          <View style={styles.section}>
            <LocationCard place={place} onPress={() => void openInMaps(place).catch(() => undefined)} />
          </View>
        ) : null}

        {/* Pending actions (JM-38) — organizer only, while scheduled. */}
        {isOrganizer && status === 'scheduled' ? (
          <PendingActionsSheet
            actions={pendingActions({
              eventId: id,
              specification: event.specification,
              numCourts: event.num_courts,
              confirmedCount: startConfirmedCount,
              confirmedTeamCount,
              hasLocation: event.has_location,
            })}
          />
        ) : null}

        {hasOwnChat ? (
          <View style={styles.section}>
            <Button
              label={t('openChat', { ns: 'chat' })}
              variant="secondary"
              fullWidth
              loading={ensureChannel.isPending}
              onPress={openEventChat}
            />
            {ensureChannel.isError ? (
              <Text variant="caption" tone="destructive" style={styles.subtitle}>
                {t('chatUnavailable', { ns: 'chat' })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {bottomArea != null ? (
        <View style={styles.bottomBar} testID="event-bottom-area">
          {bottomArea}
        </View>
      ) : null}

      <LeaveLockedSheet
        visible={lockedSheetOpen}
        onClose={() => setLockedSheetOpen(false)}
        organizer={organizer}
        onChat={onMessageOrganizer}
        chatLoading={busy}
      />
      <TeamEventSheet visible={teamSheetOpen} onClose={() => setTeamSheetOpen(false)} onChoose={onTeamChoice} />
      <EditResponseSheet
        visible={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        onChoose={(c) => void onEditChoice(c)}
        canLeave={leaveOffered}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: space[8] },
  section: { paddingHorizontal: space[4], paddingTop: space[4] },
  subtitle: { marginTop: space[1] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] },
  bottomBar: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[6],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  col: { gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  flex: { flex: 1 },
  inviterRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  centerText: { textAlign: 'center' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  chipRow: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  closedLine: { paddingVertical: space[2] },
});
