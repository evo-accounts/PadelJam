'use client';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent,
  useEventParticipants,
  usePartnerRequests,
  useGroupMembers,
  useRequestPartner,
  useAcceptPartnerRequest,
  useDeclinePartnerRequest,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function PartnerRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const requests = usePartnerRequests(id);
  const groupId = event.data?.group_id ?? '';
  const members = useGroupMembers(groupId);
  const requestPartner = useRequestPartner(id);
  const acceptReq = useAcceptPartnerRequest(id);
  const declineReq = useDeclinePartnerRequest(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
      .finally(() => setBusy(false));
  };

  const reqs = requests.data ?? [];
  const incoming = reqs.filter((r) => r.target_id === uid && r.status === 'pending');
  const outgoing = reqs.filter((r) => r.requester_id === uid && r.status === 'pending');

  const candidates = useMemo(() => {
    const confirmedIds = new Set(
      (participants.data ?? []).filter((p) => p.status === 'confirmed').map((p) => p.user_id),
    );
    const requestedIds = new Set(
      reqs.filter((r) => r.status === 'pending').flatMap((r) => [r.requester_id, r.target_id]),
    );
    return (members.data ?? []).filter(
      (m) => m.user_id !== uid && !confirmedIds.has(m.user_id) && !requestedIds.has(m.user_id),
    );
  }, [members.data, participants.data, reqs, uid]);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;
  if (event.data.specification !== 'team') {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">{t('notTeamEvent')}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('partnerRequestsTitle')}</h1>
        <Button asChild variant="ghost">
          <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {incoming.length > 0 ? (
        <Card className="divide-y p-0">
          {incoming.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarImage src={avatarUrl(r.requester?.avatar_url) ?? undefined} />
                  <AvatarFallback>
                    {(r.requester?.full_name ?? '—').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">
                  {t('partnerIncoming', { name: r.requester?.full_name ?? '—' })}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => declineReq.mutateAsync(r.id))}>
                  {t('declineCta')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => run(() => acceptReq.mutateAsync(r.id))}>
                  {t('acceptCta')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('choosePartnerTitle')}</h2>
        {members.isLoading || participants.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : candidates.length === 0 && outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPartnerRequests')}</p>
        ) : (
          <Card className="divide-y p-0">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(r.target?.avatar_url) ?? undefined} />
                    <AvatarFallback>
                      {(r.target?.full_name ?? '—').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{r.target?.full_name ?? '—'}</span>
                </div>
                <span className="text-xs text-muted-foreground">{t('partnerRequestPending')}</span>
              </div>
            ))}
            {candidates.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>
                      {(m.profiles?.full_name ?? '—').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{m.profiles?.full_name ?? '—'}</span>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => requestPartner.mutateAsync([m.user_id]))}>
                  {t('requestPartnerCta')}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
