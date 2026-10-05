'use client';
/**
 * Manage players (UX-MEVT-10..13, 25) — reached from the event page's "Manage players" row and the
 * dashboard's Confirmed card. Web's twin of mobile's `app/event/[id]/manage-players.tsx`: who is
 * coming, never who has paid (that is `../payments`).
 *
 * Header: back, "Manage players", and one action (UX-MEVT-13) — "+ Add manually" on a public group
 * event, where every member may already join; "+ Invite" otherwise (private group or group-less).
 *
 * Tabs: Confirmed n/capacity · Waiting list n (only once full or while anyone queues, UX-MEVT-12)
 * · Invited n. A mixed event splits Confirmed into Women x/y and Men x/y (UX-MEVT-25) and labels
 * each waiting player's side.
 *
 * Web has no swipe, so each row's actions sit in a ⋯ menu — the same rules as mobile's swipe and
 * tap sheet (`manageRoster`):
 *   Confirmed    — Remove → dialog: "Remove from confirmed list" (back to invited) and "Remove from
 *                  event"; a public group event has no invited state, so only the latter (D3).
 *   Invited      — Mark as confirmed (a roster row: organizer_mark_confirmed; an invitee without
 *                  one: organizer_confirm_invitee) and Remove (a roster row: organizer_remove_
 *                  participant; a pending invitation without one: organizer_revoke_invitation, 0127).
 *   Waiting list — Remove only, in queue order (D2: the organizer never confirms a waiting player).
 * Every action needs a scheduled event; after that the lists are read-only.
 *
 * Team events (UX-MEVT-14, 15, 26 — mobile's #245) open on two views, Teams and Players:
 *   Teams    — TeamsTab: the team blocks, the unassigned area, drag and drop, the "Assign to team…"
 *              menu (the keyboard path) and "+" (Select player dialog), the switch button (Switch
 *              player dialog) and ✕ (Remove player: from the team → Invited, or from the event;
 *              a guest has no invited state, so from the event only).
 *   Players  — the tabs above plus Interested: players who want to play without a pair. Confirm
 *              asks which team (only teams with an open slot) and places them; Remove sends them
 *              back to Invited (out of the event on a public group event, D3). Mark as confirmed
 *              on Invited asks for the team the same way.
 * The live page no longer carries a team builder: teams are set up here before the start.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, MoreHorizontal, Plus, UserRoundCheck, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useAssignToTeam,
  useConfirmInvitee,
  useEvent,
  useEventInvitedPlayers,
  useEventParticipants,
  useEventRealtime,
  useEventTeams,
  useMarkConfirmed,
  useRemoveFromTeam,
  useRemoveParticipant,
  useRevokeInvitation,
} from '@padel/api';
import { AddManualDialog } from '@/components/event/manage/AddManualDialog';
import { ManageDialog } from '@/components/event/manage/ManageDialog';
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
import { RadioCards } from '@/components/event/manage/RadioCards';
import { SelectPlayerDialog } from '@/components/event/manage/SelectPlayerDialog';
import { SwitchPlayerDialog } from '@/components/event/manage/SwitchPlayerDialog';
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
import { GroupPageTitle } from '@/components/group/GroupHeader';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';

type Tab = 'confirmed' | 'waiting' | 'invited' | 'interested';
type TeamView = 'teams' | 'players';
type RemoveMode = 'to_invited' | 'from_event';
/** Who a team placement is for: a roster row, or a pending invitee without one. */
type Placeable = { participantId: string | null; userId: string | null; name: string | null; confirmed: boolean };
type TeamDialog =
  | { kind: 'select'; team: number }
  | { kind: 'switch'; team: number; participantId: string }
  | { kind: 'remove'; team: number; participantId: string }
  | { kind: 'pick'; who: Placeable }
  | null;
/** A yes/no question before an action: its copy, and what "yes" runs. */
type Ask = { title: string; body: string; confirmLabel: string; destructive?: boolean; run: () => Promise<void> };

function Empty({
  icon: Icon,
  title,
  body,
  action,
  testId,
}: {
  icon: typeof Users;
  title: string;
  body: string;
  action?: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center" data-testid={testId}>
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export default function ManagePlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitedQuery = useEventInvitedPlayers(id);
  const teamsQuery = useEventTeams(id);
  const markConfirmed = useMarkConfirmed(id);
  const confirmInvitee = useConfirmInvitee(id);
  const removeParticipant = useRemoveParticipant(id);
  const revokeInvitation = useRevokeInvitation(id);
  const assign = useAssignToTeam(id);
  const removeFromTeam = useRemoveFromTeam(id);

  const [picked, setPicked] = useState<Tab>('confirmed');
  const [view, setView] = useState<TeamView>('teams');
  const [side, setSide] = useState<ManageSide>('female');
  const [addingManual, setAddingManual] = useState(false);
  /** The remove dialog: the row and the modes it offers (two on a private event's Confirmed tab). */
  const [removing, setRemoving] = useState<{ row: ManageRow; modes: RemoveMode[] } | null>(null);
  const [teamDialog, setTeamDialog] = useState<TeamDialog>(null);
  /** The Remove player dialog's choice, and the Which team? dialog's. */
  const [slotRemoveMode, setSlotRemoveMode] = useState<'from_team' | 'from_event'>('from_team');
  const [pickedTeam, setPickedTeam] = useState<string>('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const back = `/app/event/${id}/manage`;

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  const e = event.data;
  if (e == null || uid == null || uid !== e.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <GroupPageTitle title={t('managePlayersTitle')} fallbackHref={back} />
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="manage-players-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  const roster = manageRoster(e, participants.data ?? [], invitedQuery.data ?? []);
  const scheduled = e.status === 'scheduled';
  const team = e.specification === 'team';
  const mixed = e.specification === 'mixed';
  const action = headerAction(e);
  // The waiting list can empty while its tab is open (a claim, a removal): fall back to Confirmed.
  // Interested exists on team events only.
  const tab: Tab =
    (picked === 'waiting' && !roster.showWaiting) || (picked === 'interested' && !team) ? 'confirmed' : picked;
  const board = teamBoard(e, participants.data ?? [], teamsQuery.data ?? []);
  const nameOf = (row: ManageRow) => row.name ?? '—';
  const teamName = (n: number) => t('teamLabel', { number: n });

  // Confirming accepts the invitation and removing may reopen or delete it (0122): the shared
  // hooks refresh the roster only, so the invited list, teams and invite candidates follow here.
  const refreshAll = () => qc.invalidateQueries({ queryKey: ['event', id] });

  const messageOf = (x: unknown) => {
    const code = x instanceof Error ? x.message : 'unknown_error';
    return t(rosterErrorKey(code), { defaultValue: t('unknown_error') });
  };
  const fail = (x: unknown) => toast(messageOf(x), 'error');

  /** Runs a dialog's action: busy while it runs, its refusal shown in the dialog, closed on success. */
  const runInDialog = async (fn: () => Promise<void>, close: () => void) => {
    setBusy(true);
    setDialogError(null);
    try {
      await fn();
      void refreshAll();
      close();
    } catch (x) {
      setDialogError(messageOf(x));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: ManageRow, mode: RemoveMode) => {
    if (row.participantId == null) return;
    setBusy(true);
    try {
      await removeParticipant.mutateAsync({ participantId: row.participantId, mode, targetName: row.name ?? undefined });
      void refreshAll();
      setRemoving(null);
      toast(t(mode === 'to_invited' ? 'mpMovedToInvitedToast' : 'mpRemovedToast', { name: nameOf(row) }));
    } catch (x) {
      fail(x);
    } finally {
      setBusy(false);
    }
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
      void refreshAll();
      toast(t('mpConfirmedToast', { name: nameOf(row) }));
    } catch (x) {
      fail(x);
    }
  };

  /** Pending invitation without a roster row: withdrawn, nobody notified (0127). */
  const askRevoke = (row: ManageRow) => {
    const invitationId = row.invitationId;
    if (invitationId == null) return;
    setDialogError(null);
    setAsk({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpRevokeBody'),
      confirmLabel: t('removeCta'),
      destructive: true,
      run: async () => {
        await revokeInvitation.mutateAsync({ invitationId });
        toast(t('mpRevokedToast', { name: nameOf(row) }));
      },
    });
  };

  // --- Team events (UX-MEVT-14, 15) ---------------------------------------------------------

  /** Put someone in a slot: a roster row is assigned, a pending invitee confirmed into it. */
  const placeIn = async (who: Placeable, target: BoardTeam, slot: Slot) => {
    if (who.participantId != null) {
      await assign.mutateAsync({
        participantId: who.participantId,
        teamNumber: target.number,
        slot,
        targetName: who.name ?? undefined,
      });
    } else if (who.userId != null) {
      await confirmInvitee.mutateAsync({ userId: who.userId, teamNumber: target.number, slot });
    } else {
      return;
    }
    toast(t('tmAssignedToast', { name: who.name ?? '—', team: teamName(target.number) }));
  };

  /** The teams `who` can go to: an open slot, and never the team they are alone in already. */
  const openTeamsFor = (who: Placeable) =>
    teamsWithOpenSlot(board).filter(
      (tm) =>
        who.participantId == null ||
        (tm.a?.participantId !== who.participantId && tm.b?.participantId !== who.participantId),
    );

  /** "Which team?" (UX-MEVT-14): Interested → Confirm, and Invited → Mark as confirmed. */
  const pickTeam = (who: Placeable) => {
    const open = openTeamsFor(who);
    if (open.length === 0) {
      toast(t('tmNoOpenTeam'), 'error');
      return;
    }
    setDialogError(null);
    setPickedTeam(String(open[0]!.number));
    setTeamDialog({ kind: 'pick', who });
  };

  const placeableOf = (row: ManageRow): Placeable => ({
    participantId: row.participantId,
    userId: row.userId,
    name: row.name,
    confirmed: false,
  });
  const placeableOfPlayer = (p: BoardPlayer): Placeable => ({
    participantId: p.participantId,
    userId: p.userId,
    name: p.name,
    confirmed: p.status === 'confirmed',
  });

  /** A card dropped on an empty slot (or assigned from its menu): not yet confirmed → ask first. */
  const onPlace = (p: BoardPlayer, target: BoardTeam, slot: Slot) => {
    const who = placeableOfPlayer(p);
    if (who.confirmed) {
      void placeIn(who, target, slot).then(refreshAll, fail);
      return;
    }
    setDialogError(null);
    setAsk({
      title: t('tmConfirmPlayerTitle'),
      body: t('tmConfirmPlayerBody', { name: p.name ?? '—' }),
      confirmLabel: tc('confirm'),
      run: () => placeIn(who, target, slot),
    });
  };

  /** Interested → Remove (UX-MEVT-14): back to Invited; out of the event on a public group event. */
  const removeInterested = (row: ManageRow) => {
    if (interestedRemoveMode(e) === 'from_event') {
      setRemoving({ row, modes: ['from_event'] });
      return;
    }
    const participantId = row.participantId;
    if (participantId == null) return;
    setDialogError(null);
    setAsk({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpInterestedRemoveBody'),
      confirmLabel: t('tmRemoveToInvited'),
      destructive: true,
      run: async () => {
        await removeParticipant.mutateAsync({ participantId, mode: 'to_invited', targetName: row.name ?? undefined });
        toast(t('mpMovedToInvitedToast', { name: nameOf(row) }));
      },
    });
  };

  const sideLabel = (s: ManageSide | null) => (s === 'female' ? t('mpSideFemale') : s === 'male' ? t('mpSideMale') : undefined);

  const menuItem = (key: string, label: string, onSelect: () => void, row: ManageRow, destructive = false) => (
    <DropdownMenuItem
      key={key}
      variant={destructive ? 'destructive' : undefined}
      onSelect={onSelect}
      data-testid={`manage-player-${key}-${row.key}`}
    >
      {label}
    </DropdownMenuItem>
  );

  const rowMenu = (row: ManageRow, kind: Tab) => {
    const items: React.ReactNode[] = [];
    if (row.userId != null && !row.guest) {
      items.push(
        <DropdownMenuItem key="profile" asChild>
          <Link href={`/app/profile/${row.userId}`}>{t('mpSeeProfile')}</Link>
        </DropdownMenuItem>,
      );
    }
    if (scheduled && kind === 'confirmed') {
      items.push(menuItem('remove', t('removeCta'), () => setRemoving({ row, modes: removeModes(e) }), row, true));
    }
    if (scheduled && kind === 'invited') {
      const can = invitedActions(row);
      if (can.confirm) {
        items.push(
          menuItem(
            'confirm',
            t('mpMarkConfirmed'),
            // On a team event, which team first (UX-MEVT-14).
            () => (team ? pickTeam(placeableOf(row)) : void markAsConfirmed(row)),
            row,
          ),
        );
      }
      if (can.remove === 'participant') {
        items.push(menuItem('remove', t('removeCta'), () => setRemoving({ row, modes: ['from_event'] }), row, true));
      } else if (can.remove === 'invitation') {
        items.push(menuItem('remove', t('removeCta'), () => askRevoke(row), row, true));
      }
    }
    if (scheduled && kind === 'interested') {
      items.push(menuItem('confirm', t('mpConfirmCta'), () => pickTeam(placeableOf(row)), row));
      items.push(
        menuItem(
          'remove',
          interestedRemoveMode(e) === 'to_invited' ? t('tmRemoveToInvited') : t('mpRemoveFromEvent'),
          () => removeInterested(row),
          row,
          true,
        ),
      );
    }
    if (scheduled && kind === 'waiting') {
      items.push(menuItem('remove', t('removeCta'), () => setRemoving({ row, modes: ['from_event'] }), row, true));
    }
    if (items.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="tertiary"
            size="icon-sm"
            aria-label={t('mpRowActions', { name: nameOf(row) })}
            data-testid={`manage-player-menu-${row.key}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{items}</DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderRow = (row: ManageRow, kind: Tab, index: number) => {
    const name = nameOf(row);
    const seat = team && row.participantId != null ? teamOfParticipant(board, row.participantId) : null;
    const subtitle =
      kind === 'waiting'
        ? [t('mpQueuePosition', { n: index + 1 }), mixed ? sideLabel(row.side) : undefined].filter(Boolean).join(' · ')
        : [seat ? t('tmKindTeam', { team: teamName(seat.number) }) : undefined, row.standby ? t('playersListStandby') : undefined]
            .filter(Boolean)
            .join(' · ') || undefined;
    return (
      <li key={row.key} className="flex items-center gap-3 px-2 py-2" data-testid={`manage-player-${row.key}`}>
        <Avatar className="size-9">
          <AvatarImage src={avatarUrl(row.avatarPath) ?? undefined} alt="" />
          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
        </span>
        {row.guest ? <Badge variant="secondary">{t('guestTag')}</Badge> : null}
        {rowMenu(row, kind)}
      </li>
    );
  };

  const addLabel = action === 'invite' ? t('mpInviteCta') : t('addManuallyCta');
  const addButton = (testId: string, variant: 'primary' | 'secondary' = 'secondary') =>
    action === 'invite' ? (
      <Button asChild variant={variant} size="sm" data-testid={testId}>
        <Link href={`/app/event/${id}/manage/invite`}>
          <Plus aria-hidden />
          {addLabel}
        </Link>
      </Button>
    ) : (
      <Button variant={variant} size="sm" onClick={() => setAddingManual(true)} data-testid={testId}>
        <Plus aria-hidden />
        {addLabel}
      </Button>
    );

  const tabOptions: { value: Tab; label: string }[] = [
    { value: 'confirmed', label: t('mpTabConfirmed', { n: roster.confirmed.length, capacity: roster.capacity }) },
    ...(roster.showWaiting ? [{ value: 'waiting' as const, label: t('mpTabWaiting', { n: roster.waiting.length }) }] : []),
    {
      value: 'invited',
      // No count until the list has loaded: "Invited 0" would claim nobody is invited.
      label: invitedQuery.data ? t('mpTabInvited', { n: roster.invited.length }) : t('playersTabInvitedPlain'),
    },
    ...(team ? [{ value: 'interested' as const, label: t('mpTabInterested', { n: roster.interested.length }) }] : []),
  ];

  let rows: ManageRow[] = [];
  let empty: React.ReactNode = null;
  if (tab === 'confirmed') {
    rows = mixed ? rowsOfSide(roster.confirmed, side) : roster.confirmed;
    if (rows.length === 0) {
      empty = (
        <Empty
          icon={Users}
          title={mixed ? t(side === 'female' ? 'mpWomenEmpty' : 'mpMenEmpty') : t('mpConfirmedEmpty')}
          body={t('mpConfirmedEmptyBody')}
          action={scheduled ? addButton('manage-players-empty-add') : undefined}
          testId="manage-players-confirmed-empty"
        />
      );
    }
  } else if (tab === 'waiting') {
    rows = roster.waiting;
    if (rows.length === 0) {
      empty = (
        <Empty icon={Clock} title={t('mpWaitingEmpty')} body={t('mpWaitingEmptyBody')} testId="manage-players-waiting-empty" />
      );
    }
  } else if (tab === 'interested') {
    rows = roster.interested;
    if (rows.length === 0) {
      empty = (
        <Empty
          icon={Users}
          title={t('mpInterestedEmpty')}
          body={t('mpInterestedEmptyBody')}
          testId="manage-players-interested-empty"
        />
      );
    }
  } else {
    rows = roster.invited;
    if (rows.length === 0) {
      empty = (
        <Empty
          icon={UserRoundCheck}
          title={t('playersInvitedEmpty')}
          body={action === 'invite' ? t('mpInvitedEmptyBody') : t('mpInvitedEmptyPublicBody')}
          action={scheduled && action === 'invite' ? addButton('manage-players-invited-empty-add') : undefined}
          testId="manage-players-invited-empty"
        />
      );
    }
  }

  const loading = participants.isLoading || (tab === 'invited' && invitedQuery.isLoading);

  // The open team dialog, re-derived from the live board so it follows every refetch.
  const dialogTeam =
    teamDialog && teamDialog.kind !== 'pick' ? board.teams.find((tm) => tm.number === teamDialog.team) : undefined;
  const dialogPlayer =
    (teamDialog?.kind === 'switch' || teamDialog?.kind === 'remove') && dialogTeam
      ? ([dialogTeam.a, dialogTeam.b].find((p) => p?.participantId === teamDialog.participantId) ?? null)
      : null;
  const closeTeamDialog = (message?: string) => {
    setTeamDialog(null);
    setDialogError(null);
    if (message) {
      void refreshAll();
      toast(message);
    }
  };

  const playersView = (
    <Tabs value={tab} onValueChange={(v) => setPicked(v as Tab)}>
      {/* Three counted tabs overflow a 375px screen in Portuguese: the list scrolls sideways. */}
      <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
        {tabOptions.map((o) => (
          <TabsTrigger key={o.value} value={o.value} className="flex-none" data-testid={`manage-players-tab-${o.value}`}>
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={tab} className="flex flex-col gap-3 pt-2">
        {mixed && tab === 'confirmed' && roster.sideCounts && roster.perSide != null ? (
          <Tabs value={side} onValueChange={(v) => setSide(v as ManageSide)}>
            <TabsList variant="line" data-testid="manage-players-side">
              <TabsTrigger value="female" data-testid="manage-players-side-female">
                {t('mpSideWomen', { n: roster.sideCounts.female, cap: roster.perSide })}
              </TabsTrigger>
              <TabsTrigger value="male" data-testid="manage-players-side-male">
                {t('mpSideMen', { n: roster.sideCounts.male, cap: roster.perSide })}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          (empty ?? (
            <ul className="flex flex-col" data-testid={`manage-players-${tab}`}>
              {rows.map((row, i) => renderRow(row, tab, i))}
            </ul>
          ))
        )}
      </TabsContent>
    </Tabs>
  );

  const pickWho = teamDialog?.kind === 'pick' ? teamDialog.who : null;
  const pickOpen = pickWho ? openTeamsFor(pickWho) : [];
  const teamOption = (tm: BoardTeam) => {
    const mate = tm.a ?? tm.b;
    return mate
      ? t('tmTeamOptionWith', { team: teamName(tm.number), name: mate.name ?? '—' })
      : t('tmTeamOptionEmpty', { team: teamName(tm.number) });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <GroupPageTitle
        title={t('managePlayersTitle')}
        fallbackHref={back}
        actions={scheduled ? addButton('manage-players-add', 'primary') : undefined}
      />
      {team ? (
        <Tabs value={view} onValueChange={(v) => setView(v as TeamView)}>
          <TabsList className="w-full sm:w-fit" data-testid="manage-players-view">
            <TabsTrigger value="teams" data-testid="manage-players-view-teams">
              {t('mpViewTeams')}
            </TabsTrigger>
            <TabsTrigger value="players" data-testid="manage-players-view-players">
              {t('mpViewPlayers')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="teams" className="pt-2">
            {participants.isLoading || teamsQuery.isLoading ? (
              <Skeleton className="h-60 w-full" />
            ) : (
              <TeamsTab
                board={board}
                editable={scheduled}
                onAdd={(tm) => {
                  setDialogError(null);
                  setTeamDialog({ kind: 'select', team: tm.number });
                }}
                onSwitch={(p, tm) => {
                  setDialogError(null);
                  setTeamDialog({ kind: 'switch', team: tm.number, participantId: p.participantId });
                }}
                onRemove={(p, tm) => {
                  setDialogError(null);
                  setSlotRemoveMode(p.guest ? 'from_event' : 'from_team');
                  setTeamDialog({ kind: 'remove', team: tm.number, participantId: p.participantId });
                }}
                onPlace={onPlace}
              />
            )}
          </TabsContent>
          <TabsContent value="players" className="pt-2">
            {playersView}
          </TabsContent>
        </Tabs>
      ) : (
        playersView
      )}

      <AlertDialog open={removing != null} onOpenChange={(o) => (!o && !busy ? setRemoving(null) : undefined)}>
        <AlertDialogContent data-testid="manage-players-remove-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{removing ? t('mpRemoveTitle', { name: nameOf(removing.row) }) : ''}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing && removing.modes.length > 1 ? t('mpRemoveChooseBody') : t('mpRemoveFromEventBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            {removing?.modes.includes('to_invited') ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void remove(removing.row, 'to_invited')}
                data-testid="manage-players-remove-to-invited"
              >
                {t('mpRemoveToInvited')}
              </Button>
            ) : null}
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removing && void remove(removing.row, 'from_event')}
              data-testid="manage-players-remove-from-event"
            >
              {t('mpRemoveFromEvent')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ask != null} onOpenChange={(o) => (!o && !busy ? setAsk(null) : undefined)}>
        <AlertDialogContent data-testid="manage-players-ask-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title ?? ''}</AlertDialogTitle>
            <AlertDialogDescription>{ask?.body ?? ''}</AlertDialogDescription>
          </AlertDialogHeader>
          {dialogError ? (
            <p role="alert" className="text-sm text-destructive" data-testid="manage-players-ask-error">
              {dialogError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <Button
              variant={ask?.destructive ? 'destructive' : 'primary'}
              disabled={busy}
              onClick={() => ask && void runInDialog(ask.run, () => setAsk(null))}
              data-testid="manage-players-ask-confirm"
            >
              {ask?.confirmLabel ?? ''}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {teamDialog?.kind === 'select' && dialogTeam ? (
        <SelectPlayerDialog
          eventId={id}
          team={dialogTeam}
          candidates={selectCandidates(participants.data ?? [], invitedQuery.data ?? [], board)}
          onClose={() => closeTeamDialog()}
          onDone={closeTeamDialog}
        />
      ) : null}
      {teamDialog?.kind === 'switch' && dialogTeam && dialogPlayer ? (
        <SwitchPlayerDialog
          eventId={id}
          player={dialogPlayer}
          team={dialogTeam}
          candidates={switchCandidates(participants.data ?? [], invitedQuery.data ?? [], board, dialogPlayer.participantId)}
          onClose={() => closeTeamDialog()}
          onDone={closeTeamDialog}
        />
      ) : null}
      {teamDialog?.kind === 'remove' && dialogTeam && dialogPlayer ? (
        <ManageDialog
          title={t('mpRemoveTitle', { name: dialogPlayer.name ?? '—' })}
          description={t('tmRemoveBody', { name: dialogPlayer.name ?? '—' })}
          onClose={() => closeTeamDialog()}
          primaryLabel={tc('confirm')}
          destructive={slotRemoveMode === 'from_event'}
          busy={busy}
          error={dialogError}
          onPrimary={() => {
            const p = dialogPlayer;
            const name = p.name ?? '—';
            const tn = teamName(dialogTeam.number);
            void runInDialog(
              async () => {
                if (slotRemoveMode === 'from_team') {
                  await removeFromTeam.mutateAsync({ participantId: p.participantId, targetName: name });
                  toast(t('tmRemovedFromTeamToast', { name, team: tn }));
                } else {
                  await removeParticipant.mutateAsync({ participantId: p.participantId, mode: 'from_event', targetName: name });
                  toast(t('mpRemovedToast', { name }));
                }
              },
              () => setTeamDialog(null),
            );
          }}
          testId="dialog-remove-player"
        >
          <RadioCards
            label={t('tmRemoveBody', { name: dialogPlayer.name ?? '—' })}
            // A guest has no invited state to go back to: they leave the event.
            options={[
              ...(dialogPlayer.guest ? [] : [{ value: 'from_team' as const, title: t('tmRemoveFromTeam') }]),
              { value: 'from_event' as const, title: t('mpRemoveFromEvent') },
            ]}
            value={slotRemoveMode}
            onChange={setSlotRemoveMode}
            testId="remove-player-mode"
          />
        </ManageDialog>
      ) : null}
      {pickWho ? (
        <ManageDialog
          title={t('mpPickTeamTitle', { name: pickWho.name ?? '—' })}
          description={pickWho.confirmed ? undefined : t('tmConfirmPlayerBody', { name: pickWho.name ?? '—' })}
          onClose={() => closeTeamDialog()}
          primaryLabel={tc('confirm')}
          busy={busy}
          error={dialogError}
          onPrimary={() => {
            const target = pickOpen.find((tm) => String(tm.number) === pickedTeam);
            if (!target) {
              setDialogError(t('tmNoOpenTeam'));
              return;
            }
            void runInDialog(() => placeIn(pickWho, target, openSlotsOf(target)[0]!), () => setTeamDialog(null));
          }}
          testId="dialog-pick-team"
        >
          {pickOpen.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('tmNoOpenTeam')}</p>
          ) : (
            <RadioCards
              label={t('tmPickTeamLabel')}
              options={pickOpen.map((tm) => ({ value: String(tm.number), title: teamOption(tm) }))}
              value={pickedTeam}
              onChange={setPickedTeam}
              testId="pick-team"
            />
          )}
        </ManageDialog>
      ) : null}

      {addingManual ? (
        <AddManualDialog
          eventId={id}
          mixed={mixed}
          onClose={() => setAddingManual(false)}
          onAdded={(name) => {
            setAddingManual(false);
            setPicked('confirmed');
            toast(t('mpManualAddedToast', { name }));
          }}
        />
      ) : null}
    </div>
  );
}
