'use client';
/**
 * Partner Requests (UX-JEVT-12), web's twin of mobile's `app/notifications/partner-requests.tsx` —
 * from the "Partner Requests" row at the top of Notifications, and from a `partner_request`
 * notification (notificationRoute).
 *
 * Only invitations received from other players — never an entry point for joining a team event
 * (that is the event's "Join" → Team Event dialog). Grouped by event: the event name, then its
 * date · time · place; each row the requester's photo and name with Decline and Accept.
 *
 *   Accept   a confirmation first: accepting confirms the pair and silently declines every other
 *            partner request the viewer has for that event (accept_partner_request, 0111/0112).
 *   Decline  removes the row; the requester is not told (decline_partner_request).
 *
 * `incoming_partner_requests` (0098) also carries the community join requests an admin answers.
 * They are not partner invitations, so they sit in their own section below the events and keep
 * their decline confirmation.
 */
import { useState } from 'react';
import { UserRoundSearch } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useIncomingPartnerRequests, useRespondToRequest, type IncomingPartnerRequest } from '@padel/api';
import { requestSections } from '@padel/utils';
import { eventSubtitle } from '@/components/event/EventDetailParts';
import { EmptyBlock, PlayerAvatar } from '@/components/event/PartnerParts';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';

type Pending = { item: IncomingPartnerRequest; action: 'accept' | 'decline' } | null;

export default function PartnerRequestsPage() {
  const { t, i18n } = useT('notifications');
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const [confirming, setConfirming] = useState<Pending>(null);

  const sections = requestSections(list.data ?? []);

  const respondTo = async (item: IncomingPartnerRequest, action: 'accept' | 'decline') => {
    try {
      const result = await respond.mutateAsync({
        kind: item.kind,
        requestId: item.request_id,
        action,
        entityId: item.entity_id,
      });
      if (item.kind === 'event' && action === 'accept') {
        toast(
          result === 'waiting_list'
            ? t('partnerAcceptedWaitlist', { entity: item.entity_name })
            : t('partnerAcceptedToast', { entity: item.entity_name }),
        );
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      toast(t(code, { defaultValue: t('respondError') }), 'error');
    } finally {
      setConfirming(null);
    }
  };

  // A partner request's Accept and a community request's Decline ask first; a partner request's
  // Decline is silent (the requester is not told) and a community Accept is immediate.
  const onAccept = (item: IncomingPartnerRequest) =>
    item.kind === 'event' ? setConfirming({ item, action: 'accept' }) : void respondTo(item, 'accept');
  const onDecline = (item: IncomingPartnerRequest) =>
    item.kind === 'community' ? setConfirming({ item, action: 'decline' }) : void respondTo(item, 'decline');

  const renderRow = (item: IncomingPartnerRequest) => {
    const name = item.requester_name ?? '—';
    return (
      <li
        key={item.request_id}
        className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
        data-testid={`partner-request-${item.request_id}`}
      >
        <PlayerAvatar name={name} path={item.requester_avatar} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          {item.kind === 'community' ? (
            <span className="truncate text-xs text-muted-foreground">
              {t('joinRequestLabel', { entity: item.entity_name })}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={respond.isPending}
            aria-label={t('declineFrom', { name })}
            onClick={() => onDecline(item)}
            data-testid={`partner-request-decline-${item.request_id}`}
          >
            {t('decline')}
          </Button>
          <Button
            size="sm"
            disabled={respond.isPending}
            aria-label={t('acceptFrom', { name })}
            onClick={() => onAccept(item)}
            data-testid={`partner-request-accept-${item.request_id}`}
          >
            {t('accept')}
          </Button>
        </span>
      </li>
    );
  };

  let body: React.ReactNode;
  if (list.isLoading) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (list.isError) {
    body = (
      <EmptyBlock
        tone="error"
        title={t('requestsError')}
        action={
          <Button variant="outline" onClick={() => void list.refetch()}>
            {t('retry', { ns: 'common' })}
          </Button>
        }
        testId="empty-partner-requests"
      />
    );
  } else if (sections.length === 0) {
    body = (
      <EmptyBlock
        icon={UserRoundSearch}
        title={t('requestsEmpty')}
        body={t('partnerRequestsEmptyBody')}
        testId="empty-partner-requests"
      />
    );
  } else {
    body = sections.map((s) => {
      if (s.kind === 'community') {
        return (
          <section key="community" className="flex flex-col gap-2" data-testid="partner-requests-community">
            <h2 className="text-base font-semibold">{t('joinRequestsSection')}</h2>
            <ul className="flex flex-col gap-2">{s.requests.map(renderRow)}</ul>
          </section>
        );
      }
      // incoming_partner_requests carries the event's date and place on every event row (0113).
      const ev = s.requests[0]!;
      const placeName = ev.venue_name ?? ev.manual_location_name ?? ev.manual_location_address;
      return (
        <section key={s.eventId} className="flex flex-col gap-2" data-testid={`partner-requests-event-${s.eventId}`}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">{s.eventName}</h2>
            {ev.starts_at ? (
              <p className="text-sm text-muted-foreground">{eventSubtitle(ev.starts_at, placeName, i18n.language)}</p>
            ) : null}
          </div>
          <ul className="flex flex-col gap-2">{s.requests.map(renderRow)}</ul>
        </section>
      );
    });
  }

  const c = confirming;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
      <GroupPageTitle title={t('partnerRequests')} fallbackHref="/app/notifications" />
      {body}
      <GroupConfirm
        open={c != null}
        onClose={() => setConfirming(null)}
        title={c?.action === 'accept' ? t('partnerAcceptTitle') : t('declineTitle')}
        body={
          c?.action === 'accept'
            ? t('partnerAcceptBody', { name: c.item.requester_name ?? '—', entity: c.item.entity_name })
            : t('declineBody')
        }
        confirmLabel={c?.action === 'accept' ? t('accept') : t('decline')}
        cancelLabel={t('cancel', { ns: 'common' })}
        destructive={c?.action === 'decline'}
        busy={respond.isPending}
        onConfirm={() => (c ? respondTo(c.item, c.action) : undefined)}
      />
    </div>
  );
}
