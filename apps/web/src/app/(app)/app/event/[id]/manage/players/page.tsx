'use client';
/**
 * Manage players — reached from the event page's "Manage players" row and the dashboard's
 * Confirmed card (UX-MEVT-01/03). Web's twin of mobile's `manage-players.tsx`.
 *
 * INTERIM (W1): today's roster controls, moved here unchanged from the old single-page Manage —
 * add a player manually, confirm, remove (back to invited or from the event), and the waiting,
 * stand-by and invited lists. W2 rebuilds this page as UX-MEVT-10..13 (Confirmed / Waiting list /
 * Invited tabs, Invite, Add manually dialog). Payments live on their own list (`../payments`),
 * never here: who is coming and who has paid are different lists (UX-MEVT-03).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useAddManualParticipant,
  useEvent,
  useEventInvitations,
  useEventParticipants,
  useEventRealtime,
  useMarkConfirmed,
  useRemoveParticipant,
} from '@padel/api';
import { AddManualForm } from '@/components/event/manage/AddManualForm';
import { RosterRow, type RosterParticipant } from '@/components/event/manage/RosterRow';
import { BackButton } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function ManagePlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitations = useEventInvitations(id);
  const markConfirmed = useMarkConfirmed(id);
  const removeParticipant = useRemoveParticipant(id);
  const addManual = useAddManualParticipant(id);
  const [err, setErr] = useState<string | null>(null);

  const header = (
    <div className="flex items-center gap-2">
      <BackButton fallbackHref={`/app/event/${id}/manage`} label={t('back')} />
      <h1 className="text-xl font-semibold">{t('managePlayersTitle')}</h1>
    </div>
  );

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (event.data == null || uid == null || uid !== event.data.organizer_id) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-3 sm:px-6">
        {header}
        <p className="p-8 text-center text-sm text-muted-foreground" data-testid="manage-players-forbidden">
          {t('forbidden')}
        </p>
      </div>
    );
  }

  const rows = (participants.data ?? []) as unknown as RosterParticipant[];
  const confirmed = rows.filter((p) => p.status === 'confirmed' && !p.is_standby);
  const waiting = rows.filter((p) => p.status === 'waiting_list');
  const standby = rows.filter((p) => p.is_standby);
  const invited = invitations.data ?? [];
  const scheduled = event.data.status === 'scheduled';

  const run = (fn: () => Promise<unknown>) => {
    setErr(null);
    fn().catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error', { defaultValue: t('unknown_error') })));
  };

  const section = (title: string, list: RosterParticipant[], testId: string) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-1" data-testid={testId}>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Card className="divide-y p-0">
          {list.map((p) => (
            <RosterRow
              key={p.id}
              p={p}
              feeEnabled={false}
              onConfirm={(name) => run(() => markConfirmed.mutateAsync({ participantId: p.id, targetName: name }))}
              onTogglePaid={() => undefined}
              onRemove={(mode, name) =>
                run(() => removeParticipant.mutateAsync({ participantId: p.id, mode, targetName: name }))
              }
            />
          ))}
        </Card>
      </div>
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-3 pb-8 sm:px-6">
      {header}
      {err ? (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      ) : null}

      {section(t('rosterConfirmedSection'), confirmed, 'roster-confirmed')}
      {section(t('rosterWaitingSection'), waiting, 'roster-waiting')}
      {section(t('rosterStandbySection'), standby, 'roster-standby')}

      {invited.length > 0 ? (
        <div className="flex flex-col gap-1" data-testid="roster-invited">
          <p className="text-sm font-medium text-muted-foreground">{t('rosterInvitedSection')}</p>
          <Card className="divide-y p-0">
            {invited.map((inv) => {
              const n = inv.invitee?.full_name ?? '—';
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(inv.invitee?.avatar_url) ?? undefined} />
                    <AvatarFallback>{n.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{n}</span>
                </div>
              );
            })}
          </Card>
        </div>
      ) : null}

      {confirmed.length + waiting.length + standby.length + invited.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noRoster')}</p>
      ) : null}

      {scheduled ? (
        <AddManualForm onAdd={(name, gender) => run(() => addManual.mutateAsync({ name, gender }))} />
      ) : null}
    </div>
  );
}
