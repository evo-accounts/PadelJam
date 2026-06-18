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
import { deadlineState, formatCountdown, nextWeeklyOccurrence } from '@padel/utils';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { streamClient } from '@/lib/streamClient';
import { useNow } from '@/lib/useNow';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        <ActivityIndicator color="#0B1F3A" />
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
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryLabel}>{t('back')}</Text>
          </Pressable>
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
  const isRecurring = event.series_id != null && series != null && series.is_active;
  const nextOccurrenceIso = isRecurring
    ? nextWeeklyOccurrence(series!.day_of_week, series!.start_time, new Date(event.starts_at).getTime())
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
      <Pressable
        style={[styles.btn, styles.secondaryBtn]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onMessageOrganizer}
      >
        {busy ? (
          <ActivityIndicator color="#0B1F3A" />
        ) : (
          <Text style={styles.secondaryLabel}>{t('messageOrganizerCta')}</Text>
        )}
      </Pressable>
    </View>
  ) : (
    <>
      <Pressable
        style={[styles.btn, styles.secondaryBtn]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onLeave}
      >
        {busy ? (
          <ActivityIndicator color="#0B1F3A" />
        ) : (
          <Text style={styles.secondaryLabel}>{t('leaveCta')}</Text>
        )}
      </Pressable>
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
        <Pressable
          style={[styles.btn, styles.primaryBtn]}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => router.push(`/event/${id}/live` as Href)}
        >
          <Text style={styles.primaryLabel}>
            {status === 'completed' ? t('viewResultsCta') : t('viewMatchesCta')}
          </Text>
        </Pressable>
      </View>
    );
  } else if (isOrganizer) {
    // JM-35: the organizer can also play. `me` is their participant row (set when organizing_and_playing,
    // or after they Join as a player). Join/Leave respect the same 6h/12h cutoffs as players.
    const organizerJoin =
      me == null && !joinClosed ? (
        <Pressable
          style={[styles.btn, styles.secondaryBtn]}
          accessibilityRole="button"
          disabled={busy}
          onPress={
            event.specification === 'team'
              ? () => router.push(`/event/${id}/partner-requests` as Href)
              : onJoin
          }
        >
          {busy ? (
            <ActivityIndicator color="#0B1F3A" />
          ) : (
            <Text style={styles.secondaryLabel}>{t('joinAsPlayerCta')}</Text>
          )}
        </Pressable>
      ) : null;
    const organizerLeave =
      me != null && !leaveLocked ? (
        <>
          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={onLeave}
          >
            {busy ? (
              <ActivityIndicator color="#0B1F3A" />
            ) : (
              <Text style={styles.secondaryLabel}>{t('leaveAsPlayerCta')}</Text>
            )}
          </Pressable>
          <Text style={styles.leaveHint}>{t('leaveByHint', { when: leaveByText })}</Text>
        </>
      ) : null;
    cta = (
      <View style={styles.ctaCol}>
        <Text style={styles.ctaBadge}>
          {me != null ? t('organizerPlayingBadge') : t('organizerBadge')}
        </Text>
        <Pressable
          style={[styles.btn, styles.primaryBtn]}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => router.push(`/event/${id}/manage` as Href)}
        >
          <Text style={styles.primaryLabel}>{t('manageCta')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.startBtn, !setupComplete && styles.btnDisabled]}
          accessibilityRole="button"
          disabled={busy || !setupComplete}
          onPress={onStart}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryLabel}>{t('startCta')}</Text>
          )}
        </Pressable>
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
            <Pressable
              style={[styles.btn, styles.secondaryBtn]}
              accessibilityRole="button"
              disabled={busy}
              onPress={onLeaveWaitlist}
            >
              {busy ? (
                <ActivityIndicator color="#0B1F3A" />
              ) : (
                <Text style={styles.secondaryLabel}>{t('leaveWaitlistCta')}</Text>
              )}
            </Pressable>
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
            <Pressable
              style={[styles.btn, styles.secondaryBtn, styles.btnFlex]}
              accessibilityRole="button"
              disabled={busy}
              onPress={onDecline}
            >
              {busy ? (
                <ActivityIndicator color="#0B1F3A" />
              ) : (
                <Text style={styles.secondaryLabel}>{t('declineCta')}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primaryBtn, styles.btnFlex]}
              accessibilityRole="button"
              disabled={busy}
              onPress={onAccept}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>{t('acceptCta')}</Text>
              )}
            </Pressable>
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
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.push(`/event/${id}/partner-requests` as Href)}
          >
            <Text style={styles.primaryLabel}>{t('teamJoinCta')}</Text>
          </Pressable>
        </View>
      );
    } else {
      const joinLabel = totalIn >= totalCapacity ? t('waitlistCta') : t('joinCta');
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.countdown}>{t('joinCountdown', { time: joinCountdownText })}</Text>
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={onJoin}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryLabel}>{joinLabel}</Text>
            )}
          </Pressable>
        </View>
      );
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

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
              <Pressable
                style={styles.nextCard}
                onPress={onOpenNextOccurrence}
                disabled={materialize.isPending}
              >
                <Text style={styles.sectionTitle}>{t('nextOccurrenceTitle')}</Text>
                <Text style={styles.body}>{formatWhen(nextOccurrenceIso)}</Text>
                <Text style={styles.bodyMuted}>
                  {materialize.isPending ? t('materializeOccurrenceLoading') : t('materializeOccurrenceHint')}
                </Text>
              </Pressable>
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
          {event.has_location && event.manual_location_name ? (
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
            <Pressable
              onPress={openEventChat}
              disabled={ensureChannel.isPending}
              accessibilityRole="button"
              style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#0B7BFF', borderRadius: 12, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('openChat', { ns: 'chat' })}</Text>
            </Pressable>
            {ensureChannel.isError ? (
              <Text style={{ color: '#D7263D', fontSize: 13, marginTop: 6 }}>{t('chatUnavailable', { ns: 'chat' })}</Text>
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
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32 },
  content: { paddingBottom: 32 },

  // No-access
  noAccess: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  noAccessTitle: { fontSize: 20, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  noAccessBody: { fontSize: 15, color: '#6B7685', textAlign: 'center' },

  // Hero
  hero: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  thumb: { height: 140, borderRadius: 14, backgroundColor: '#F0F3F8', marginBottom: 16 },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 24, fontWeight: '700', color: '#0B1F3A' },

  // Badge (mirrors EventCard palette)
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeScheduled: { backgroundColor: '#E6F0FF' },
  badgeTextScheduled: { color: '#0B7BFF' },
  badgeLive: { backgroundColor: '#E3F5EA' },
  badgeTextLive: { color: '#1A7F4B' },
  badgeDone: { backgroundColor: '#F0F3F8' },
  badgeTextDone: { color: '#6B7685' },

  // Recurring (5G-6)
  recurrentTag: { backgroundColor: '#EDE7FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  recurrentTagText: { fontSize: 11, fontWeight: '700', color: '#6B4EFF' },
  nextCard: { marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12 },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A95A5',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  body: { fontSize: 16, color: '#0B1F3A', fontWeight: '500' },
  bodyMuted: { fontSize: 14, color: '#6B7685', marginTop: 2 },

  // Players
  playerList: { marginTop: 12, gap: 10 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0B1F3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 13, fontWeight: '700' },
  playerName: { fontSize: 15, color: '#0B1F3A', fontWeight: '500' },

  // Details
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailLabel: { fontSize: 15, color: '#6B7685' },
  detailValue: { fontSize: 15, color: '#0B1F3A', fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  // CTA bar
  ctaBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6EAF0',
    backgroundColor: '#fff',
  },
  ctaCol: { gap: 10 },
  ctaRow: { flexDirection: 'row', gap: 12 },
  ctaBadge: { fontSize: 15, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  countdown: { fontSize: 14, fontWeight: '600', color: '#0B7BFF', textAlign: 'center' },
  deadlineNotice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7685',
    textAlign: 'center',
    paddingVertical: 8,
  },
  leaveHint: { fontSize: 13, color: '#6B7685', textAlign: 'center' },
  error: { fontSize: 14, fontWeight: '600', color: '#D7263D', marginBottom: 10, textAlign: 'center' },

  // Buttons
  btn: {
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFlex: { flex: 1 },
  primaryBtn: { backgroundColor: '#0B7BFF' },
  startBtn: { backgroundColor: '#1A7F4B' },
  btnDisabled: { opacity: 0.5 },
  startHint: { fontSize: 13, color: '#6B7685', textAlign: 'center' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
