'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent, useEventParticipants, useEventInvitations, useEventRealtime,
  useMarkConfirmed, useMarkPaid, useMarkAllPaid, useRemoveParticipant, useAddManualParticipant,
} from '@padel/api';
import { RosterRow, type RosterParticipant } from '@/components/event/manage/RosterRow';
import { AddManualForm } from '@/components/event/manage/AddManualForm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function EventManagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitations = useEventInvitations(id);
  const markConfirmed = useMarkConfirmed(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const removeParticipant = useRemoveParticipant(id);
  const addManual = useAddManualParticipant(id);
  const [err, setErr] = useState<string | null>(null);

  const isOrganizer = event.data != null && event.data.organizer_id === uid;
  useEffect(() => {
    if (!event.isLoading && event.data && !isOrganizer) router.replace(`/app/event/${id}`);
  }, [event.isLoading, event.data, isOrganizer, id, router]);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data || !isOrganizer) return null;

  const e = event.data;
  const rows = (participants.data ?? []) as unknown as RosterParticipant[];
  const confirmed = rows.filter((p) => p.status === 'confirmed' && !p.is_standby);
  const waiting = rows.filter((p) => p.status === 'waiting_list');
  const standby = rows.filter((p) => p.is_standby);
  const invited = invitations.data ?? [];
  const feeEnabled = !!e.entrance_fee_enabled;

  const run = (fn: () => Promise<unknown>) => {
    setErr(null);
    fn().catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const section = (title: string, list: RosterParticipant[]) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Card className="divide-y p-0">
          {list.map((p) => (
            <RosterRow
              key={p.id}
              p={p}
              feeEnabled={feeEnabled}
              onConfirm={(name) => run(() => markConfirmed.mutateAsync({ participantId: p.id, targetName: name }))}
              onTogglePaid={(paid, name) => run(() => markPaid.mutateAsync({ participantId: p.id, paid, targetName: name }))}
              onRemove={(mode, name) => run(() => removeParticipant.mutateAsync({ participantId: p.id, mode, targetName: name }))}
            />
          ))}
        </Card>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('manageTitle')}</h1>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      {feeEnabled ? (
        <Button variant="outline" className="self-start" onClick={() => run(() => markAllPaid.mutateAsync())}>
          {t('markAllPaidCta')}
        </Button>
      ) : null}

      {section(t('rosterConfirmedSection'), confirmed)}
      {section(t('rosterWaitingSection'), waiting)}
      {section(t('rosterStandbySection'), standby)}

      {invited.length > 0 ? (
        <div className="flex flex-col gap-1">
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

      <AddManualForm onAdd={(name, gender) => run(() => addManual.mutateAsync({ name, gender }))} />
      {/* Task 3 inserts the management-actions Card here */}
    </div>
  );
}
