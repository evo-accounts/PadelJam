'use client';
/**
 * "I need a partner" (UX-JEVT-11), web's twin of mobile's `app/event/[id]/need-partner.tsx` —
 * reached from the Team Event dialog or an interested player's "Edit response → I need a partner".
 *
 * Lists the other players who are also looking (candidates marked interested). "Invite" sends a
 * partner request at once (`request_partner`, 0112) and turns into "Invited"; clicking "Invited"
 * withdraws it (`withdraw_partner_request`). Whoever accepts first becomes the partner and every
 * other request is closed by the server. "Confirm" and "Let others invite me" end in the same
 * state — the viewer is interested, holding no spot — and return to the event.
 *
 * A private-event invitee who has not answered yet needs nothing extra: `request_partner` accepts
 * the caller's own pending invitation (0113), as `choose_partner` does.
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Search, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEventPartnerCandidates,
  usePartnerRequests,
  useRequestPartner,
  useWithdrawPartnerRequest,
} from '@padel/api';
import { filterByName, lookingForPartner, sentRequestTo } from '@padel/utils';
import { EmptyBlock, PartnerPageFrame, PlayerAvatar, useBackToEvent } from '@/components/event/PartnerParts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export default function NeedPartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const back = useBackToEvent(id);
  const uid = useSession().session?.user.id;

  const candidates = useEventPartnerCandidates(id);
  const { data: requests } = usePartnerRequests(id);
  const request = useRequestPartner(id);
  const withdraw = useWithdrawPartnerRequest(id);

  const [query, setQuery] = useState('');
  // The row being sent / withdrawn, so only its button is busy.
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looking = lookingForPartner(candidates.data ?? []);
  const rows = filterByName(looking, query);
  const fail = (e: unknown) =>
    setError(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }));

  const onToggle = async (targetId: string) => {
    if (rowBusy != null) return;
    setRowBusy(targetId);
    setError(null);
    try {
      const sent = sentRequestTo(requests ?? [], uid, targetId);
      if (sent) await withdraw.mutateAsync(sent.id);
      else await request.mutateAsync([targetId]);
    } catch (e) {
      fail(e);
    } finally {
      setRowBusy(null);
    }
  };

  const onFinish = async () => {
    setFinishing(true);
    setError(null);
    try {
      // An empty list lists the viewer as looking without asking anyone (idempotent when they
      // already are).
      await request.mutateAsync([]);
      back();
    } catch (e) {
      fail(e);
    } finally {
      setFinishing(false);
    }
  };

  let body: React.ReactNode;
  if (candidates.isLoading) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (candidates.isError) {
    body = (
      <EmptyBlock
        tone="error"
        title={t('loadError')}
        action={
          <Button variant="secondary" onClick={() => void candidates.refetch()}>
            {t('retryCta')}
          </Button>
        }
        testId="need-partner-error"
      />
    );
  } else if (looking.length === 0) {
    body = (
      <EmptyBlock icon={Users} title={t('needPartnerEmpty')} body={t('needPartnerEmptyBody')} testId="need-partner-empty" />
    );
  } else if (rows.length === 0) {
    body = <EmptyBlock icon={Search} title={t('partnerSearchEmpty')} testId="need-partner-no-match" />;
  } else {
    body = (
      <ul className="flex flex-col gap-1">
        {rows.map((c) => {
          const name = c.full_name ?? '—';
          const invited = sentRequestTo(requests ?? [], uid, c.id) != null;
          return (
            <li key={c.id} className="flex items-center gap-3 px-2 py-2">
              <PlayerAvatar name={name} path={c.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
              <Button
                size="sm"
                variant={invited ? 'secondary' : 'primary'}
                disabled={rowBusy != null || finishing}
                aria-busy={rowBusy === c.id}
                aria-pressed={invited}
                aria-label={invited ? t('partnerWithdrawLabel', { name }) : t('partnerInviteLabel', { name })}
                onClick={() => void onToggle(c.id)}
                data-testid={`need-partner-invite-${c.id}`}
              >
                {invited ? t('partnerInvitedCta') : t('partnerInviteCta')}
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  // Nothing to finish while the list failed to load: the retry is the only action.
  const barDisabled = finishing || rowBusy != null || candidates.isError;

  return (
    <PartnerPageFrame
      eventId={id}
      title={t('needPartnerTitle')}
      subtitle={t('needPartnerSubtitle')}
      error={error}
      head={
        <Input
          type="search"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          placeholder={t('partnerSearchPlaceholder')}
          aria-label={t('partnerSearchPlaceholder')}
          data-testid="need-partner-search"
        />
      }
      bottom={
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            disabled={barDisabled}
            onClick={() => void onFinish()}
            className="sm:order-2"
            data-testid="need-partner-confirm"
          >
            {t('confirmCta')}
          </Button>
          <Button
            variant="secondary"
            disabled={barDisabled}
            onClick={() => void onFinish()}
            className="sm:order-1"
            data-testid="need-partner-let-others"
          >
            {t('letOthersInviteCta')}
          </Button>
        </div>
      }
    >
      {body}
    </PartnerPageFrame>
  );
}
