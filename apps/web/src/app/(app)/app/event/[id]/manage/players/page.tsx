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
 *                  one: organizer_confirm_invitee) and Remove.
 *   Waiting list — Remove only, in queue order (D2: the organizer never confirms a waiting player).
 * Every action needs a scheduled event; after that the lists are read-only.
 *
 * Team events: Mark as confirmed is hidden — confirming there means picking a team (UX-MEVT-14,
 * W3). Web's team builder stays on the live page until then.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, MoreHorizontal, Plus, UserRoundCheck, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useConfirmInvitee,
  useEvent,
  useEventInvitedPlayers,
  useEventParticipants,
  useEventRealtime,
  useMarkConfirmed,
  useRemoveParticipant,
} from '@padel/api';
import { AddManualDialog } from '@/components/event/manage/AddManualDialog';
import {
  headerAction,
  invitedActions,
  manageRoster,
  removeModes,
  rosterErrorKey,
  rowsOfSide,
  type ManageRow,
  type ManageSide,
} from '@/components/event/manage/manageRoster';
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

type Tab = 'confirmed' | 'waiting' | 'invited';
type RemoveMode = 'to_invited' | 'from_event';

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
  const qc = useQueryClient();
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitedQuery = useEventInvitedPlayers(id);
  const markConfirmed = useMarkConfirmed(id);
  const confirmInvitee = useConfirmInvitee(id);
  const removeParticipant = useRemoveParticipant(id);

  const [picked, setPicked] = useState<Tab>('confirmed');
  const [side, setSide] = useState<ManageSide>('female');
  const [addingManual, setAddingManual] = useState(false);
  /** The remove dialog: the row and the modes it offers (two on a private event's Confirmed tab). */
  const [removing, setRemoving] = useState<{ row: ManageRow; modes: RemoveMode[] } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const tab: Tab = picked === 'waiting' && !roster.showWaiting ? 'confirmed' : picked;
  const nameOf = (row: ManageRow) => row.name ?? '—';

  // Confirming accepts the invitation and removing may reopen or delete it (0122): the shared
  // hooks refresh the roster only, so the invited list, teams and invite candidates follow here.
  const refreshAll = () => qc.invalidateQueries({ queryKey: ['event', id] });

  const fail = (x: unknown) => {
    const code = x instanceof Error ? x.message : 'unknown_error';
    toast(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }), 'error');
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

  const sideLabel = (s: ManageSide | null) => (s === 'female' ? t('mpSideFemale') : s === 'male' ? t('mpSideMale') : undefined);

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
      items.push(
        <DropdownMenuItem
          key="remove"
          variant="destructive"
          onSelect={() => setRemoving({ row, modes: removeModes(e) })}
          data-testid={`manage-player-remove-${row.key}`}
        >
          {t('removeCta')}
        </DropdownMenuItem>,
      );
    }
    if (scheduled && kind === 'invited') {
      const can = invitedActions(row, { team });
      if (can.confirm) {
        items.push(
          <DropdownMenuItem
            key="confirm"
            onSelect={() => void markAsConfirmed(row)}
            data-testid={`manage-player-confirm-${row.key}`}
          >
            {t('mpMarkConfirmed')}
          </DropdownMenuItem>,
        );
      }
      if (can.remove) {
        items.push(
          <DropdownMenuItem
            key="remove"
            variant="destructive"
            onSelect={() => setRemoving({ row, modes: ['from_event'] })}
            data-testid={`manage-player-remove-${row.key}`}
          >
            {t('removeCta')}
          </DropdownMenuItem>,
        );
      }
    }
    if (scheduled && kind === 'waiting') {
      items.push(
        <DropdownMenuItem
          key="remove"
          variant="destructive"
          onSelect={() => setRemoving({ row, modes: ['from_event'] })}
          data-testid={`manage-player-remove-${row.key}`}
        >
          {t('removeCta')}
        </DropdownMenuItem>,
      );
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
    const subtitle =
      kind === 'waiting'
        ? [t('mpQueuePosition', { n: index + 1 }), mixed ? sideLabel(row.side) : undefined].filter(Boolean).join(' · ')
        : row.standby
          ? t('playersListStandby')
          : undefined;
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <GroupPageTitle
        title={t('managePlayersTitle')}
        fallbackHref={back}
        actions={scheduled ? addButton('manage-players-add', 'primary') : undefined}
      />
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
