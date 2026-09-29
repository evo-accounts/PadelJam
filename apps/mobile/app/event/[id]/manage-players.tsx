/**
 * Manage players (UX-MEVT-10..13, 25) — reached from the event page's "Manage players" row and the
 * dashboard's Confirmed card. Who is coming, never who has paid (that is `payments.tsx`).
 *
 * Header: back, "Manage players", and one action (UX-MEVT-13) — Add manually on a public group
 * event, where every member may already join; Invite otherwise (private group or group-less).
 *
 * Tabs: Confirmed n/capacity · Waiting list n (only once full or while anyone queues, UX-MEVT-12)
 * · Invited n. A mixed event splits Confirmed into Women x/y and Men x/y (UX-MEVT-25), and labels
 * each waiting player's side.
 *
 * Actions, per SwipeRow's rules: a swipe reveals ONE action, and the same actions (plus the
 * profile) are on the row's tap sheet, so nothing is swipe-only.
 *   Confirmed    — Remove → sheet: "Remove from confirmed list" (back to invited) and "Remove from
 *                  event"; a public group event has no invited state, so only the latter (D3).
 *   Invited      — Mark as confirmed (a roster row: organizer_mark_confirmed; an invitee without
 *                  one: organizer_confirm_invitee) and Remove (a roster row: organizer_remove_
 *                  participant; a pending invitation without one: organizer_revoke_invitation, 0127).
 *   Waiting list — Remove only, in queue order (D2: the organizer never confirms a waiting player).
 * Every action needs a scheduled event; after that the lists are read-only.
 *
 * Team events (UX-MEVT-14, 15, 26) open on two views, Teams and Players:
 *   Teams    — TeamsTab: the team blocks, the unassigned row, drag-and-drop and "+" (Select
 *              player sheet), the switch icon (Switch player sheet) and ✕ (Remove player: from the
 *              team → Invited, or from the event).
 *   Players  — the tabs above plus Interested: players who want to play without a pair. Their
 *              swipe is Confirm (which team? → placed, confirmed with the pair); the tap sheet adds
 *              Remove (back to Invited; out of the event on a public group event, D3). Mark as
 *              confirmed on Invited asks for the team the same way.
 */
import {
  useAssignToTeam,
  useConfirmInvitee,
  useEvent,
  useEventInvitedPlayers,
  useEventParticipants,
  useEventTeams,
  useMarkConfirmed,
  useRemoveFromTeam,
  useRemoveParticipant,
  useRevokeInvitation,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddManualSheet } from '@/components/event/manage/AddManualSheet';
import {
  headerAction,
  interestedRemoveMode,
  invitedActions,
  manageRoster,
  removeModes,
  rosterErrorKey,
  rowsOfSide,
  type ManageRow,
  type ManageSide,
} from '@/components/event/manage/manageRoster';
import { SelectPlayerSheet } from '@/components/event/manage/SelectPlayerSheet';
import { SwitchPlayerSheet } from '@/components/event/manage/SwitchPlayerSheet';
import {
  openSlotsOf,
  selectCandidates,
  switchCandidates,
  teamBoard,
  teamOfParticipant,
  teamsWithOpenSlot,
  type BoardPlayer,
  type BoardTeam,
  type Slot,
} from '@/components/event/manage/teamBoard';
import { TeamsTab } from '@/components/event/manage/TeamsTab';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Badge,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  Segmented,
  SwipeRow,
  TopBar,
  useActionSheet,
  useBanner,
  useConfirm,
  type SheetAction,
} from '../../../components/ui';

type Tab = 'confirmed' | 'waiting' | 'invited' | 'interested';
type TeamView = 'teams' | 'players';
/** Who a team placement is for: a roster row, or a pending invitee without one. */
type Placeable = { participantId: string | null; userId: string | null; name: string | null; confirmed: boolean };
type TeamSheet = { kind: 'select'; team: number } | { kind: 'switch'; team: number; participantId: string } | null;

export default function ManagePlayersScreen() {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const router = useRouter();
  const goBack = useGoBack();
  // `?view=players` opens a team event on its Players view; Teams is the default (and what the
  // "Teams not fully set up" pending action asks for with `?view=teams`).
  const { id, view: viewParam } = useLocalSearchParams<{ id: string; view?: string }>();
  const uid = useSession().session?.user.id;
  const show = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();

  const { data: event, isLoading } = useEvent(id);
  const participants = useEventParticipants(id);
  const invitedQuery = useEventInvitedPlayers(id);
  const markConfirmed = useMarkConfirmed(id);
  const confirmInvitee = useConfirmInvitee(id);
  const removeParticipant = useRemoveParticipant(id);
  const revokeInvitation = useRevokeInvitation(id);
  const teamsQuery = useEventTeams(id);
  const assign = useAssignToTeam(id);
  const removeFromTeam = useRemoveFromTeam(id);

  const [picked, setPicked] = useState<Tab>('confirmed');
  const [view, setView] = useState<TeamView>(viewParam === 'players' ? 'players' : 'teams');
  const [teamSheet, setTeamSheet] = useState<TeamSheet>(null);
  const [side, setSide] = useState<ManageSide>('female');
  const [addingManual, setAddingManual] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('managePlayersTitle')} />
        <EmptyState fill title={t('forbidden')} testID="manage-players-forbidden" />
      </SafeAreaView>
    );
  }

  const roster = manageRoster(event, participants.data ?? [], invitedQuery.data ?? []);
  const scheduled = event.status === 'scheduled';
  const team = event.specification === 'team';
  const mixed = event.specification === 'mixed';
  const action = headerAction(event);
  // The waiting list can empty while its tab is open (a claim, a removal): fall back to Confirmed.
  // Interested exists on team events only.
  const tab: Tab =
    (picked === 'waiting' && !roster.showWaiting) || (picked === 'interested' && !team) ? 'confirmed' : picked;
  const board = teamBoard(event, participants.data ?? [], teamsQuery.data ?? []);

  const openInvite = () => router.push(`/event/${id}/invite` as Href);
  const openAdd = () => (action === 'invite' ? openInvite() : setAddingManual(true));
  const openProfile = (userId: string) => router.push(`/profile/${userId}` as Href);
  const nameOf = (row: ManageRow) => row.name ?? '—';

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
  };

  const remove = async (row: ManageRow, mode: 'to_invited' | 'from_event') => {
    if (row.participantId == null) return;
    try {
      await removeParticipant.mutateAsync({ participantId: row.participantId, mode, targetName: row.name ?? undefined });
      banner.show(t(mode === 'to_invited' ? 'mpMovedToInvitedToast' : 'mpRemovedToast', { name: nameOf(row) }), 'success');
    } catch (e) {
      fail(e);
    }
  };

  /** The Confirmed tab's remove sheet: the sheet itself is the confirmation (UX-MEVT-10). */
  const removeOptions = (): SheetAction[] =>
    removeModes(event).map((mode) =>
      mode === 'to_invited'
        ? { key: 'to_invited', label: t('mpRemoveToInvited') }
        : // selfConfirm: choosing it in this sheet IS the confirmation; a second sheet would ask twice.
          { key: 'from_event', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true },
    );

  const askRemoveConfirmed = async (row: ManageRow) => {
    const key = await show({ title: t('mpRemoveTitle', { name: nameOf(row) }), actions: removeOptions() });
    if (key === 'to_invited' || key === 'from_event') await remove(row, key);
  };

  /** Waiting list and Invited rows leave the event only — one confirmation, naming the player. */
  const askRemoveFromEvent = async (row: ManageRow) => {
    const ok = await confirm({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpRemoveFromEventBody'),
      confirmLabel: t('mpRemoveFromEvent'),
      destructive: true,
    });
    if (ok) await remove(row, 'from_event');
  };

  const markAsConfirmed = async (row: ManageRow) => {
    try {
      if (row.participantId != null) {
        await markConfirmed.mutateAsync({ participantId: row.participantId, targetName: row.name ?? undefined });
      } else if (row.userId != null) {
        await confirmInvitee.mutateAsync({ userId: row.userId });
      } else {
        return;
      }
      banner.show(t('mpConfirmedToast', { name: nameOf(row) }), 'success');
    } catch (e) {
      fail(e);
    }
  };

  /** Pending invitation without a roster row: withdrawn, nobody notified (0127). */
  const askRevoke = async (row: ManageRow) => {
    if (row.invitationId == null) return;
    const ok = await confirm({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpRevokeBody'),
      confirmLabel: t('removeCta'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await revokeInvitation.mutateAsync({ invitationId: row.invitationId });
      banner.show(t('mpRevokedToast', { name: nameOf(row) }), 'success');
    } catch (e) {
      fail(e);
    }
  };
  const removeInvited = (row: ManageRow) =>
    invitedActions(row).remove === 'invitation' ? askRevoke(row) : askRemoveFromEvent(row);

  // --- Team events (UX-MEVT-14, 15) ---------------------------------------------------------

  const teamName = (n: number) => t('teamLabel', { n });

  /** Put someone in a slot: a roster row is assigned, a pending invitee confirmed into it. */
  const placeIn = async (who: Placeable, target: BoardTeam, slot: Slot) => {
    try {
      if (who.participantId != null) {
        await assign.mutateAsync({ participantId: who.participantId, teamNumber: target.number, slot });
      } else if (who.userId != null) {
        await confirmInvitee.mutateAsync({ userId: who.userId, teamNumber: target.number, slot });
      } else {
        return;
      }
      banner.show(t('tmAssignedToast', { name: who.name ?? '—', team: teamName(target.number) }), 'success');
    } catch (e) {
      fail(e);
    }
  };

  const teamOption = (tm: BoardTeam) => {
    const mate = tm.a ?? tm.b;
    return mate
      ? t('tmTeamOptionWith', { team: teamName(tm.number), name: mate.name ?? '—' })
      : t('tmTeamOptionEmpty', { team: teamName(tm.number) });
  };

  /**
   * "Which team?" (UX-MEVT-14): the teams with an open slot. `ask` routes a player who is not
   * confirmed through "Confirm player" first — the unassigned row's tap; Confirm / Mark as
   * confirmed already say it.
   */
  const pickTeam = async (who: Placeable, ask: boolean) => {
    // Someone alone in a team (an Invited row) is moved: their own team is not an option.
    const open = teamsWithOpenSlot(board).filter(
      (tm) => who.participantId == null || (tm.a?.participantId !== who.participantId && tm.b?.participantId !== who.participantId),
    );
    if (open.length === 0) {
      banner.show(t('tmNoOpenTeam'));
      return;
    }
    const name = who.name ?? '—';
    const key = await show({
      title: t('mpPickTeamTitle', { name }),
      actions: open.map((tm) => ({
        key: String(tm.number),
        label: teamOption(tm),
        testID: `pick-team-${tm.number}`,
        confirm:
          ask && !who.confirmed
            ? { title: t('tmConfirmPlayerTitle'), body: t('tmConfirmPlayerBody', { name }), confirmLabel: tc('confirm') }
            : undefined,
      })),
    });
    const target = open.find((tm) => String(tm.number) === key);
    if (target) await placeIn(who, target, openSlotsOf(target)[0]!);
  };

  const placeableOf = (row: ManageRow, confirmed: boolean): Placeable => ({
    participantId: row.participantId,
    userId: row.userId,
    name: row.name,
    confirmed,
  });
  const placeableOfPlayer = (p: BoardPlayer): Placeable => ({
    participantId: p.participantId,
    userId: p.userId,
    name: p.name,
    confirmed: p.status === 'confirmed',
  });

  /** A card dropped on an empty slot: someone not yet confirmed is asked about first. */
  const onDrop = async (p: BoardPlayer, target: BoardTeam, slot: Slot) => {
    if (p.status !== 'confirmed') {
      const ok = await confirm({
        title: t('tmConfirmPlayerTitle'),
        body: t('tmConfirmPlayerBody', { name: p.name ?? '—' }),
        confirmLabel: tc('confirm'),
      });
      if (!ok) return;
    }
    await placeIn(placeableOfPlayer(p), target, slot);
  };

  /** The ✕ on a filled slot (UX-MEVT-15): out of the team (→ Invited) or out of the event. */
  const askRemoveFromSlot = async (p: BoardPlayer, tm: BoardTeam) => {
    const name = p.name ?? '—';
    const key = await show({
      title: t('mpRemoveTitle', { name }),
      actions: [
        // A guest has no invited state to go back to: they leave the event.
        ...(p.guest ? [] : [{ key: 'from_team', label: t('tmRemoveFromTeam') }]),
        { key: 'from_event', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true },
      ],
    });
    try {
      if (key === 'from_team') {
        await removeFromTeam.mutateAsync({ participantId: p.participantId });
        banner.show(t('tmRemovedFromTeamToast', { name, team: teamName(tm.number) }), 'success');
      } else if (key === 'from_event') {
        await removeParticipant.mutateAsync({ participantId: p.participantId, mode: 'from_event', targetName: name });
        banner.show(t('mpRemovedToast', { name }), 'success');
      }
    } catch (e) {
      fail(e);
    }
  };

  /** Interested → Remove (UX-MEVT-14): back to Invited; out of the event on a public group event. */
  const removeInterested = async (row: ManageRow) => {
    const mode = interestedRemoveMode(event);
    if (mode === 'from_event') {
      await askRemoveFromEvent(row);
      return;
    }
    const ok = await confirm({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpInterestedRemoveBody'),
      confirmLabel: t('tmRemoveToInvited'),
      destructive: true,
    });
    if (ok) await remove(row, 'to_invited');
  };

  /** Invited → Mark as confirmed: on a team event, which team first (UX-MEVT-14). */
  const confirmInvited = (row: ManageRow) => (team ? pickTeam(placeableOf(row, false), false) : markAsConfirmed(row));

  const openRowSheet = async (row: ManageRow, kind: Tab) => {
    const actions: SheetAction[] = [];
    if (row.userId != null && !row.guest) actions.push({ key: 'profile', label: t('mpSeeProfile') });
    if (scheduled && kind === 'confirmed') actions.push(...removeOptions());
    if (scheduled && kind === 'invited') {
      const can = invitedActions(row);
      if (can.confirm) actions.push({ key: 'confirm', label: t('mpMarkConfirmed') });
      if (can.remove) actions.push({ key: 'remove', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true });
    }
    if (scheduled && kind === 'interested') {
      actions.push({ key: 'confirm', label: t('mpConfirmCta') });
      actions.push({
        key: 'remove',
        label: interestedRemoveMode(event) === 'to_invited' ? t('tmRemoveToInvited') : t('mpRemoveFromEvent'),
        destructive: true,
        selfConfirm: true,
      });
    }
    if (scheduled && kind === 'waiting') {
      actions.push({ key: 'remove', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true });
    }
    if (actions.length === 0) return;
    if (actions.length === 1 && actions[0]!.key === 'profile' && row.userId) {
      openProfile(row.userId);
      return;
    }
    const key = await show({ title: nameOf(row), actions });
    if (key === 'profile' && row.userId) openProfile(row.userId);
    else if (key === 'to_invited' || key === 'from_event') await remove(row, key);
    else if (key === 'confirm') await (kind === 'interested' ? pickTeam(placeableOf(row, false), false) : confirmInvited(row));
    else if (key === 'remove') {
      if (kind === 'interested') await removeInterested(row);
      else if (kind === 'invited') await removeInvited(row);
      else await askRemoveFromEvent(row);
    }
  };

  /** The one action a swipe reveals, or null for a row with nothing to do. */
  const swipeOf = (row: ManageRow, kind: Tab): { label: string; run: () => void; destructive: boolean } | null => {
    if (!scheduled) return null;
    if (kind === 'confirmed') return { label: t('removeCta'), run: () => void askRemoveConfirmed(row), destructive: true };
    if (kind === 'waiting') return { label: t('removeCta'), run: () => void askRemoveFromEvent(row), destructive: true };
    // SwipeRow reveals ONE action (its rule 2): Confirm; Remove is on the row's tap sheet.
    if (kind === 'interested') {
      return { label: t('mpConfirmCta'), run: () => void pickTeam(placeableOf(row, false), false), destructive: false };
    }
    const can = invitedActions(row);
    if (can.confirm) return { label: t('mpMarkConfirmed'), run: () => void confirmInvited(row), destructive: false };
    if (can.remove) return { label: t('removeCta'), run: () => void removeInvited(row), destructive: true };
    return null;
  };

  const sideLabel = (s: ManageSide | null) => (s === 'female' ? t('mpSideFemale') : s === 'male' ? t('mpSideMale') : undefined);

  const renderRow = (row: ManageRow, kind: Tab, index: number) => {
    const name = nameOf(row);
    const seat = team && row.participantId != null ? teamOfParticipant(board, row.participantId) : null;
    const subtitle =
      kind === 'waiting'
        ? [t('mpQueuePosition', { n: index + 1 }), mixed ? sideLabel(row.side) : undefined].filter(Boolean).join(' · ')
        : [seat ? t('tmKindTeam', { team: teamName(seat.number) }) : undefined, row.standby ? t('playersListStandby') : undefined]
            .filter(Boolean)
            .join(' · ') || undefined;
    const swipe = swipeOf(row, kind);
    const hasSheet = scheduled || (row.userId != null && !row.guest);
    const content = (
      <ListRow
        title={name}
        subtitle={subtitle}
        leading={<Avatar uri={avatarUrl(row.avatarPath)} name={name} colourKey={row.userId ?? row.key} size="md" decorative />}
        trailing={row.guest ? <Badge label={t('guestTag')} /> : undefined}
        onPress={hasSheet ? () => void openRowSheet(row, kind) : undefined}
        // Only a pressable row is an accessibility element; a plain View's testID never reaches E2E.
        testID={hasSheet ? `manage-player-${row.key}` : undefined}
      />
    );
    return swipe ? (
      <SwipeRow key={row.key} actionLabel={swipe.label} onAction={swipe.run} destructive={swipe.destructive}>
        {content}
      </SwipeRow>
    ) : (
      <View key={row.key}>{content}</View>
    );
  };

  const tabOptions = [
    { value: 'confirmed' as const, label: t('mpTabConfirmed', { n: roster.confirmed.length, capacity: roster.capacity }) },
    ...(roster.showWaiting ? [{ value: 'waiting' as const, label: t('mpTabWaiting', { n: roster.waiting.length }) }] : []),
    {
      value: 'invited' as const,
      // No count until the list has loaded: "Invited 0" would claim nobody is invited.
      label: invitedQuery.data ? t('mpTabInvited', { n: roster.invited.length }) : t('playersTabInvitedPlain'),
    },
    ...(team ? [{ value: 'interested' as const, label: t('mpTabInterested', { n: roster.interested.length }) }] : []),
  ];

  const addAction =
    scheduled
      ? { label: action === 'invite' ? t('mpInviteCta') : t('addManuallyCta'), onPress: openAdd, testID: 'manage-players-empty-add' }
      : undefined;

  let rows: ManageRow[] = [];
  let empty: React.ReactNode = null;
  if (tab === 'confirmed') {
    rows = mixed ? rowsOfSide(roster.confirmed, side) : roster.confirmed;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.2')}
          title={mixed ? t(side === 'female' ? 'mpWomenEmpty' : 'mpMenEmpty') : t('mpConfirmedEmpty')}
          body={t('mpConfirmedEmptyBody')}
          action={addAction}
          testID="manage-players-confirmed-empty"
        />
      );
    }
  } else if (tab === 'waiting') {
    rows = roster.waiting;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.badge.clock')}
          title={t('mpWaitingEmpty')}
          body={t('mpWaitingEmptyBody')}
          testID="manage-players-waiting-empty"
        />
      );
    }
  } else if (tab === 'interested') {
    rows = roster.interested;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.2')}
          title={t('mpInterestedEmpty')}
          body={t('mpInterestedEmptyBody')}
          testID="manage-players-interested-empty"
        />
      );
    }
  } else {
    rows = roster.invited;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.badge.clock')}
          title={t('playersInvitedEmpty')}
          body={action === 'invite' ? t('mpInvitedEmptyBody') : t('mpInvitedEmptyPublicBody')}
          action={action === 'invite' ? addAction : undefined}
          testID="manage-players-invited-empty"
        />
      );
    }
  }

  const loading = participants.isLoading || (tab === 'invited' && invitedQuery.isLoading);
  const teamsView = team && view === 'teams';

  // The open team sheet, re-derived from the live board so it follows every refetch.
  const sheetTeam = teamSheet ? board.teams.find((tm) => tm.number === teamSheet.team) : undefined;
  const sheetPlayer =
    teamSheet?.kind === 'switch' && sheetTeam
      ? ([sheetTeam.a, sheetTeam.b].find((p) => p?.participantId === teamSheet.participantId) ?? null)
      : null;
  const closeTeamSheet = (message?: string) => {
    setTeamSheet(null);
    if (message) banner.show(message, 'success');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        title={t('managePlayersTitle')}
        actions={
          scheduled
            ? [
                {
                  icon: '+',
                  label: action === 'invite' ? t('mpInviteCta') : t('addManuallyCta'),
                  onPress: openAdd,
                  testID: 'manage-players-add',
                },
              ]
            : []
        }
      />
      <View style={styles.head}>
        {team ? (
          <Segmented
            options={[
              { value: 'teams' as const, label: t('mpViewTeams') },
              { value: 'players' as const, label: t('mpViewPlayers') },
            ]}
            value={view}
            onChange={setView}
            testID="manage-players-view"
          />
        ) : null}
        {teamsView ? null : (
          <Segmented options={tabOptions} value={tab} onChange={setPicked} singleLine testID="manage-players-tabs" />
        )}
        {mixed && tab === 'confirmed' && roster.sideCounts && roster.perSide != null ? (
          <Segmented
            options={[
              { value: 'female' as const, label: t('mpSideWomen', { n: roster.sideCounts.female, cap: roster.perSide }) },
              { value: 'male' as const, label: t('mpSideMen', { n: roster.sideCounts.male, cap: roster.perSide }) },
            ]}
            value={side}
            onChange={setSide}
            singleLine
            testID="manage-players-side"
          />
        ) : null}
      </View>
      {teamsView ? (
        loading || teamsQuery.isLoading ? (
          <ActivityIndicator color={colors.foreground} style={styles.loading} />
        ) : (
          <TeamsTab
            board={board}
            editable={scheduled}
            onAdd={(tm) => setTeamSheet({ kind: 'select', team: tm.number })}
            onSwitch={(p, tm) => setTeamSheet({ kind: 'switch', team: tm.number, participantId: p.participantId })}
            onRemove={(p, tm) => void askRemoveFromSlot(p, tm)}
            onPlace={(p, tm, slot) => void onDrop(p, tm, slot)}
            onPickTeam={(p) => void pickTeam(placeableOfPlayer(p), true)}
          />
        )
      ) : (
        <ScrollView contentContainerStyle={[styles.content, empty != null && listEmptyContent]}>
          {loading ? (
            <ActivityIndicator color={colors.foreground} style={styles.loading} />
          ) : (
            (empty ?? rows.map((row, i) => renderRow(row, tab, i)))
          )}
        </ScrollView>
      )}

      {teamSheet?.kind === 'select' && sheetTeam ? (
        <SelectPlayerSheet
          eventId={id}
          team={sheetTeam}
          candidates={selectCandidates(participants.data ?? [], invitedQuery.data ?? [], board)}
          onClose={() => closeTeamSheet()}
          onDone={closeTeamSheet}
        />
      ) : null}
      {teamSheet?.kind === 'switch' && sheetTeam && sheetPlayer ? (
        <SwitchPlayerSheet
          eventId={id}
          player={sheetPlayer}
          team={sheetTeam}
          candidates={switchCandidates(participants.data ?? [], invitedQuery.data ?? [], board, sheetPlayer.participantId)}
          onClose={() => closeTeamSheet()}
          onDone={closeTeamSheet}
        />
      ) : null}

      {addingManual ? (
        <AddManualSheet
          eventId={id}
          mixed={mixed}
          onClose={() => setAddingManual(false)}
          onAdded={(name) => {
            setAddingManual(false);
            setPicked('confirmed');
            banner.show(t('mpManualAddedToast', { name }), 'success');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[8] },
  loading: { paddingVertical: space[6] },
});
