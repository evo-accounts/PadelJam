import {
  useAcceptEventInvitation,
  useDeclineEventInvitation,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventSeries,
  useEventTeams,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
  useStartEvent,
  useEnsureChannel,
  useMaterializeOccurrence,
  type EventType,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { deadlineState, formatCountdown } from '@padel/utils';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { streamClient } from '@/lib/streamClient';
import { useNow } from '@/lib/useNow';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, palette } from '../../../theme';
import { Button, Card, TopBar } from '../../../components/ui';

/** Capitalize the first character of a raw enum value (rest left untouched). */
function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Format an ISO timestamp like `Sat 14 Jun · 18:00` (mirrors EventCard). */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

/** Map an event status to its i18n status-badge key (mirrors EventCard). */
function statusKey(status: string): 'statusScheduled' | 'statusInProgress' | 'statusCompleted' {
  if (status === 'in_progress') return 'statusInProgress';
  if (status === 'completed') return 'statusCompleted';
  return 'statusScheduled';
}

/** Pick the badge container + text styles for a status (mirrors EventCard palette). */
function badgeStyles(status: string): {
  container: { backgroundColor: string };
  text: { color: string };
} {
  if (status === 'in_progress') {
    return { container: styles.badgeLive, text: styles.badgeTextLive };
  }
  if (status === 'completed') {
    return { container: styles.badgeDone, text: styles.badgeTextDone };
  }
  return { container: styles.badgeScheduled, text: styles.badgeTextScheduled };
}

export default function EventDetailScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: event, isLoading } = useEvent(id);
  const { data: participantsData } = useEventParticipants(id);
  const { data: invitationsData } = useEventInvitations(id);
  const { data: teamsData } = useEventTeams(id);
  const { data: series } = useEventSeries(id);

  const joinEvent = useJoinEvent();
  const leaveEvent = useLeaveEvent();
  const leaveWaitingList = useLeaveWaitingList(id);
  const acceptInvitation = useAcceptEventInvitation();
  const declineInvitation = useDeclineEventInvitation(id);
  const startEvent = useStartEvent(id);
  const ensureChannel = useEnsureChannel();
  const materialize = useMaterializeOccurrence(id);
  const onOpenNextOccurrence = async () => {
    setError(null);
    try {
      const newId = await materialize.mutateAsync();
      router.push(`/event/${newId}/manage` as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    }
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ticking clock so the join countdown + deadline-gated CTAs stay live.
  const nowMs = useNow();

  // --- Loading ---
  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  // --- No access (RLS hid the row -> data is null) ---
  if (event == null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.noAccess}>
          <Text style={styles.noAccessTitle}>{t('noAccessTitle')}</Text>
          <Text style={styles.noAccessBody}>{t('noAccessBody')}</Text>
          <Button
            label={t('back')}
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  const participants = participantsData ?? [];
  const invitations = invitationsData ?? [];

  // --- Capacity math ---
  const regularCapacity = event.num_courts * 4;
  const confirmedRegular = participants.filter(
    (p) => p.status === 'confirmed' && !p.is_standby,
  ).length;
  const standbyUsed = participants.filter((p) => p.is_standby).length;
  const totalCapacity =
    regularCapacity + (event.allow_standby ? (event.standby_spots ?? 0) : 0);
  const totalIn = confirmedRegular + standbyUsed;
  const confirmedCount = confirmedRegular;
  const spotsLeft = Math.max(0, regularCapacity - confirmedRegular);

  // --- Start gate: server counts status='confirmed' regardless of is_standby ---
  const startConfirmedCount = participants.filter((p) => p.status === 'confirmed').length;
  const confirmedTeamCount = (teamsData ?? []).filter((tm) => tm.is_confirmed).length;
  const setupComplete =
    startConfirmedCount >= event.num_courts * 4 &&
    (event.specification !== 'team' || confirmedTeamCount >= event.num_courts * 2);

  // --- My relationship to this event ---
  const isOrganizer = uid != null && uid === event.organizer_id;
  const me = participants.find((p) => p.user_id === uid) ?? null;
  const myInvite = invitations.find((i) => i.invitee_id === uid) ?? null;

  // --- Derived labels ---
  const typeLabel = t(`type${cap(event.event_type)}Label`);
  const specLabel = t(`spec${cap(event.specification)}Label`);
  const scoringLabel = t(`scoring${cap(event.scoring_mode)}Label`);
  const scoringText =
    event.scoring_mode === 'classic'
      ? scoringLabel
      : `${scoringLabel} · ${event.scoring_value}`;
  const feeText = event.entrance_fee_enabled
    ? event.entrance_fee_method != null
      ? `${event.entrance_fee_amount ?? 0} · ${t(`fee${cap(event.entrance_fee_method)}Label`)}`
      : `${event.entrance_fee_amount ?? 0}`
    : t('feeFree');

  const confirmedList = participants.filter(
    (p) => p.status === 'confirmed' && !p.is_standby,
  );

  const organizerRow = participants.find((p) => p.user_id === event.organizer_id) ?? null;
  const organizerName = organizerRow?.profiles?.full_name ?? null;

  const status = event.status;
  const badge = badgeStyles(status);

  // --- Recurring series (5G-6 + A1): tag + clickable next-occurrence card ---
  // The card must show EXACTLY what materialize_occurrence creates: source.starts_at + 7 days
  // (the RPC's `+ interval '7 days'`). Using the series day/time here would diverge from the
  // created row whenever this occurrence was edited off-schedule.
  const isRecurring = event.series_id != null && series != null && series.is_active;
  const nextOccurrenceIso = isRecurring
    ? new Date(new Date(event.starts_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // --- Deadlines (JM-18..21): 6h join cutoff, 12h leave cutoff, both derived from starts_at ---
  const { joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked } = deadlineState(
    event.starts_at,
    nowMs,
  );
  const joinCountdownText = formatCountdown(joinCutoffMs - nowMs);
  const leaveByText = formatWhen(new Date(leaveCutoffMs).toISOString());

  const hasOwnChat = !!event && (event.is_private || event.group_id == null);
  const openEventChat = async () => {
    if (ensureChannel.isPending) return;
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'event', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      /* surfaced via ensureChannel.isError below */
    }
  };

  // --- CTA action wrapper ---
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = () =>
    run(() => joinEvent.mutateAsync({ eventId: id, groupId: event.group_id }));
  const onLeave = () =>
    run(() => leaveEvent.mutateAsync({ eventId: id, groupId: event.group_id }));
  const onLeaveWaitlist = () => run(() => leaveWaitingList.mutateAsync());
  const onAccept = () =>
    run(() => acceptInvitation.mutateAsync({ eventId: id, groupId: event.group_id }));
  const onDecline = () => run(() => declineInvitation.mutateAsync());
  const onStart = () =>
    run(async () => {
      await startEvent.mutateAsync({
        eventType: event.event_type as EventType,
        confirmedParticipantIds: participants
          .filter((p) => p.status === 'confirmed')
          .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
          .map((p) => p.id),
        numCourts: event.num_courts,
      });
      router.push(`/event/${id}/live` as Href);
    });

  const onMessageOrganizer = () =>
    run(async () => {
      const channel = streamClient.channel('messaging', {
        members: [uid!, event.organizer_id],
      });
      await channel.watch();
      router.push(('/chat/' + channel.cid) as never);
    });

  // Past the leave cutoff: a confirmed/standby player can no longer self-leave (JM-19) —
  // offer a DM to the organizer instead. Before the cutoff: Leave + a "leave by" hint.
  const leaveOrContact = leaveLocked ? (
    <View style={styles.ctaCol}>
      <Text style={styles.deadlineNotice}>{t('leaveLockedBody')}</Text>
      <Button
        label={t('messageOrganizerCta')}
        variant="outline"
        loading={busy}
        onPress={onMessageOrganizer}
      />
    </View>
  ) : (
    <>
      <Button
        label={t('leaveCta')}
        variant="outline"
        loading={busy}
        onPress={onLeave}
      />
      <Text style={styles.leaveHint}>{t('leaveByHint', { when: leaveByText })}</Text>
    </>
  );

  // --- Adaptive CTA content ---
  const showJoinLeave = status === 'scheduled';

  // Badge shown above live/results CTAs so the viewer's role stays visible.
  const roleBadge = isOrganizer
    ? t('organizerBadge')
    : me
      ? me.status === 'waiting_list'
        ? t('waitlistBadge', { pos: me.waiting_list_position ?? 0 })
        : me.is_standby
          ? t('standbyBadge')
          : t('goingBadge')
      : null;

  let cta: React.ReactNode = null;
  if (status === 'in_progress' || status === 'completed') {
    cta = (
      <View style={styles.ctaCol}>
        {roleBadge != null ? <Text style={styles.ctaBadge}>{roleBadge}</Text> : null}
        <Button
          label={status === 'completed' ? t('viewResultsCta') : t('viewMatchesCta')}
          disabled={busy}
          onPress={() => router.push(`/event/${id}/live` as Href)}
        />
      </View>
    );
  } else if (isOrganizer) {
    // JM-35: the organizer can also play. `me` is their participant row (set when organizing_and_playing,
    // or after they Join as a player). Join/Leave respect the same 6h/12h cutoffs as players.
    const organizerJoin =
      me == null && !joinClosed ? (
        <Button
          label={t('joinAsPlayerCta')}
          variant="outline"
          loading={busy}
          onPress={
            event.specification === 'team'
              ? () => router.push(`/event/${id}/partner-requests` as Href)
              : onJoin
          }
        />
      ) : null;
    const organizerLeave =
      me != null && !leaveLocked ? (
        <>
          <Button
            label={t('leaveAsPlayerCta')}
            variant="outline"
            loading={busy}
            onPress={onLeave}
          />
          <Text style={styles.leaveHint}>{t('leaveByHint', { when: leaveByText })}</Text>
        </>
      ) : null;
    cta = (
      <View style={styles.ctaCol}>
        <Text style={styles.ctaBadge}>
          {me != null ? t('organizerPlayingBadge') : t('organizerBadge')}
        </Text>
        <Button
          label={t('manageCta')}
          disabled={busy}
          onPress={() => router.push(`/event/${id}/manage` as Href)}
        />
        <Button
          label={t('startCta')}
          loading={busy}
          disabled={!setupComplete}
          onPress={onStart}
        />
        {!setupComplete ? (
          <Text style={styles.startHint}>
            {t('startSetupIncomplete', { needed: event.num_courts * 4 })}
          </Text>
        ) : null}
        {organizerJoin}
        {organizerLeave}
      </View>
    );
  } else if (me) {
    if (me.status === 'waiting_list') {
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>
            {t('waitlistBadge', { pos: me.waiting_list_position ?? 0 })}
          </Text>
          {showJoinLeave ? (
            <Button
              label={t('leaveWaitlistCta')}
              variant="outline"
              loading={busy}
              onPress={onLeaveWaitlist}
            />
          ) : null}
        </View>
      );
    } else if (me.is_standby) {
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>{t('standbyBadge')}</Text>
          {showJoinLeave ? leaveOrContact : null}
        </View>
      );
    } else {
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>{t('goingBadge')}</Text>
          {showJoinLeave ? leaveOrContact : null}
        </View>
      );
    }
  } else if (myInvite && showJoinLeave) {
    if (joinClosed) {
      cta = <Text style={styles.deadlineNotice}>{t('joiningClosed')}</Text>;
    } else {
      const inviterRow =
        participants.find((p) => p.user_id === myInvite.invited_by) ?? null;
      const inviterName = inviterRow?.profiles?.full_name ?? null;
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>
            {inviterName != null
              ? t('invitedBanner', { name: inviterName })
              : t('invitedBannerGeneric')}
          </Text>
          <View style={styles.ctaRow}>
            <Button
              label={t('declineCta')}
              variant="outline"
              loading={busy}
              onPress={onDecline}
            />
            <Button
              label={t('acceptCta')}
              loading={busy}
              onPress={onAccept}
            />
          </View>
        </View>
      );
    }
  } else if (showJoinLeave) {
    if (joinClosed) {
      cta = <Text style={styles.deadlineNotice}>{t('joiningClosed')}</Text>;
    } else if (event.specification === 'team') {
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.countdown}>{t('joinCountdown', { time: joinCountdownText })}</Text>
          <Button
            label={t('teamJoinCta')}
            disabled={busy}
            onPress={() => router.push(`/event/${id}/partner-requests` as Href)}
          />
        </View>
      );
    } else {
      const joinLabel = totalIn >= totalCapacity ? t('waitlistCta') : t('joinCta');
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.countdown}>{t('joinCountdown', { time: joinCountdownText })}</Text>
          <Button
            label={joinLabel}
            loading={busy}
            onPress={onJoin}
          />
        </View>
      );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={() => router.back()} backLabel={t('back')} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.thumb} />
          <View style={styles.heroHeader}>
            <Text style={styles.name}>{event.name}</Text>
            <View style={[styles.badge, badge.container]}>
              <Text style={[styles.badgeText, badge.text]} numberOfLines={1}>
                {t(statusKey(status))}
              </Text>
            </View>
            {isRecurring ? (
              <View style={styles.recurrentTag}>
                <Text style={styles.recurrentTagText}>{t('recurrentTag')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* About */}
        {event.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('aboutTitle')}</Text>
            <Text style={styles.body}>{event.description}</Text>
          </View>
        ) : null}

        {/* When */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('whenTitle')}</Text>
          <Text style={styles.body}>{formatWhen(event.starts_at)}</Text>
          <Text style={styles.bodyMuted}>
            {t('durationValue', { count: event.duration_minutes })}
          </Text>
          {nextOccurrenceIso ? (
            isOrganizer ? (
              <Card
                style={styles.nextCard}
                onPress={onOpenNextOccurrence}
              >
                <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
                <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
                <Text style={styles.bodyMuted}>
                  {materialize.isPending ? t('materializeOccurrenceLoading') : t('materializeOccurrenceHint')}
                </Text>
              </Card>
            ) : (
              <View style={styles.nextCard}>
                <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
                <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
              </View>
            )
          ) : null}
        </View>

        {/* Where */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('whereTitle')}</Text>
          {event.venue ? (
            <>
              <Text style={styles.body}>{event.venue.name}</Text>
              {event.venue.address ? (
                <Text style={styles.bodyMuted}>{event.venue.address}</Text>
              ) : null}
            </>
          ) : event.has_location && event.manual_location_name ? (
            <>
              <Text style={styles.body}>{event.manual_location_name}</Text>
              {event.manual_location_address ? (
                <Text style={styles.bodyMuted}>{event.manual_location_address}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.body}>{t('locationTbd')}</Text>
          )}
        </View>

        {/* Players */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('playersTitle')}</Text>
          <Text style={styles.body}>{t('confirmedCount', { count: confirmedCount })}</Text>
          <Text style={styles.bodyMuted}>{t('spotsLeft', { count: spotsLeft })}</Text>
          {confirmedList.length > 0 ? (
            <View style={styles.playerList}>
              {confirmedList.map((p) => {
                const pName = p.profiles?.full_name ?? p.guest_name ?? '—';
                return (
                  <View key={p.id} style={styles.playerRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarInitial}>
                        {(pName.charAt(0) || '?').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.playerName}>{pName}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('detailsTitle')}</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('formatLabel')}</Text>
            <Text style={styles.detailValue}>{`${typeLabel} · ${specLabel}`}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('scoringLabel')}</Text>
            <Text style={styles.detailValue}>{scoringText}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('feeLabel')}</Text>
            <Text style={styles.detailValue}>{feeText}</Text>
          </View>
          {organizerName != null ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('organizerLabel')}</Text>
              <Text style={styles.detailValue}>{organizerName}</Text>
            </View>
          ) : null}
        </View>

        {/* Chat */}
        {hasOwnChat ? (
          <View style={styles.section}>
            <Button
              label={t('openChat', { ns: 'chat' })}
              fullWidth
              loading={ensureChannel.isPending}
              style={styles.chatButton}
              onPress={openEventChat}
            />
            {ensureChannel.isError ? (
              <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 6 }}>{t('chatUnavailable', { ns: 'chat' })}</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Pinned CTA bar */}
      {cta != null ? (
        <View style={styles.ctaBar}>
          {error != null ? <Text style={styles.error}>{t(error)}</Text> : null}
          {cta}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chatButton: { marginTop: 8 },
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 32 },

  // No-access
  noAccess: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  noAccessTitle: { fontSize: 20, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  noAccessBody: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },

  // Hero
  hero: { backgroundColor: colors.card, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  thumb: { height: 140, borderRadius: 14, backgroundColor: colors.muted, marginBottom: 16 },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.foreground },

  // Badge (mirrors EventCard palette)
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeScheduled: { backgroundColor: palette.purple[100] },
  badgeTextScheduled: { color: colors.primary },
  badgeLive: { backgroundColor: palette.green[100] },
  badgeTextLive: { color: colors.successStrong },
  badgeDone: { backgroundColor: colors.muted },
  badgeTextDone: { color: colors.mutedForeground },

  // Recurring (5G-6)
  recurrentTag: { backgroundColor: palette.purple[100], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  recurrentTagText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  nextCard: { marginTop: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12 },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  body: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  bodyMuted: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },

  // Players
  playerList: { marginTop: 12, gap: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: colors.card, fontSize: 13, fontWeight: '700' },
  playerName: { fontSize: 15, color: colors.foreground, fontWeight: '500' },

  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: 15, color: colors.mutedForeground },
  detailValue: { fontSize: 15, color: colors.foreground, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  // CTA bar
  ctaBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  ctaCol: { gap: 10 },
  ctaRow: { flexDirection: 'row', gap: 12 },
  ctaBadge: { fontSize: 15, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  countdown: { fontSize: 14, fontWeight: '600', color: colors.primary, textAlign: 'center' },
  deadlineNotice: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: 8,
  },
  leaveHint: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
  error: { fontSize: 14, fontWeight: '600', color: colors.destructive, marginBottom: 10, textAlign: 'center' },

  // Buttons
  startHint: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
});
