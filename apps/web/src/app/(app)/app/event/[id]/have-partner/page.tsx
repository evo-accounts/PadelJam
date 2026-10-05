'use client';
/**
 * "I have a partner" (UX-JEVT-10), web's twin of mobile's `app/event/[id]/have-partner.tsx` —
 * reached from the Team Event dialog or an interested player's "Edit response → I found a partner".
 *
 * Pick one eligible player (`event_partner_candidates`, 0111/0112: the invitees and participants,
 * or the whole group on a public group event — never the caller, a blocked user, or anyone already
 * paired or waiting) and Confirm: `choose_partner` places both players as a pair with no acceptance
 * step. 'confirmed' opens the "You are going" dialog with the partner; 'waiting_list' (no room for
 * two, or pairs already queued — decision 6) returns to the event, which shows the waiting-list
 * banner.
 *
 * "+ Add manually" pairs with a guest instead (decision 7, `choose_guest_partner`, 0113).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CircleDot, Circle, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useChooseGuestPartner, useChoosePartner, useEvent, useEventPartnerCandidates, useEventTeams } from '@padel/api';
import { eventPlace, filterByName, teamPartnerOf } from '@padel/utils';
import { eventSubtitle, JoinedDialog } from '@/components/event/EventDetailParts';
import { EmptyBlock, PartnerPageFrame, PlayerAvatar, useBackToEvent } from '@/components/event/PartnerParts';
import { GuestPartnerDialog } from '@/components/event/TeamDialogs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { downloadEventIcs } from '@/lib/eventLinks';
import { cn } from '@/lib/utils';

export default function HavePartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useT('event');
  const back = useBackToEvent(id);
  const uid = useSession().session?.user.id;

  const event = useEvent(id);
  const candidates = useEventPartnerCandidates(id);
  const teams = useEventTeams(id);
  const choose = useChoosePartner(id);
  const chooseGuest = useChooseGuestPartner(id);

  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  // Remounts the guest dialog on every open, so it never shows the last attempt's name.
  const [guestKey, setGuestKey] = useState(0);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [joinedOpen, setJoinedOpen] = useState(false);

  const all = candidates.data ?? [];
  const rows = filterByName(all, query);
  // A pick gone from the list (paired meanwhile) is not a pick.
  const selected = picked != null && all.some((c) => c.id === picked) ? picked : null;
  const busy = choose.isPending || chooseGuest.isPending;
  const errText = (e: unknown) =>
    t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') });

  const done = (result: 'confirmed' | 'waiting_list') => {
    if (result === 'confirmed') {
      setJoinedOpen(true);
    } else {
      toast(t('pairWaitlistToast'));
      back();
    }
  };

  const onConfirm = async () => {
    if (selected == null) return;
    setError(null);
    try {
      done(await choose.mutateAsync(selected));
    } catch (e) {
      setError(errText(e));
    }
  };

  const openGuest = () => {
    setGuestError(null);
    setGuestKey((k) => k + 1);
    setGuestOpen(true);
  };

  const onSaveGuest = async (name: string) => {
    setGuestError(null);
    try {
      const result = await chooseGuest.mutateAsync({ name });
      setGuestOpen(false);
      done(result);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      if (code === 'invalid_guest_name') {
        setGuestError(t(code));
      } else {
        setGuestOpen(false);
        setError(errText(e));
      }
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
        testId="have-partner-error"
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyBlock
        icon={Users}
        title={all.length === 0 ? t('havePartnerEmpty') : t('partnerSearchEmpty')}
        body={t('havePartnerEmptyBody')}
        action={<Button onClick={openGuest}>{t('addManuallyCta')}</Button>}
        testId="have-partner-empty"
      />
    );
  } else {
    body = (
      <div role="radiogroup" aria-label={t('havePartnerSubtitle')} className="flex flex-col gap-1">
        {rows.map((c) => {
          const name = c.full_name ?? '—';
          const on = c.id === selected;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(c.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50',
                on && 'bg-accent',
              )}
              data-testid={`partner-candidate-${c.id}`}
            >
              <PlayerAvatar name={name} path={c.avatar_url} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
              {on ? (
                <CircleDot className="size-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const e = event.data;
  const place = e ? eventPlace(e) : null;
  const partner = teamPartnerOf(teams.data ?? [], uid);
  const onCalendar = () => {
    if (!e) return;
    try {
      downloadEventIcs({
        id,
        name: e.name,
        starts_at: e.starts_at,
        duration_minutes: e.duration_minutes,
        description: e.description,
        place,
      });
    } catch {
      toast(t('calendarError'), 'error');
    }
  };

  return (
    <PartnerPageFrame
      eventId={id}
      title={t('havePartnerTitle')}
      subtitle={t('havePartnerSubtitle')}
      error={error}
      head={
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={t('partnerSearchPlaceholder')}
            aria-label={t('partnerSearchPlaceholder')}
            className="flex-1"
            data-testid="have-partner-search"
          />
          <Button variant="tertiary" onClick={openGuest} data-testid="have-partner-add-manually">
            {t('addManuallyShort')}
          </Button>
        </div>
      }
      bottom={
        <>
          <p className="text-center text-xs text-muted-foreground">{t('havePartnerConfirmLine')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={selected == null || busy}
              onClick={() => void onConfirm()}
              className="sm:order-2"
              data-testid="have-partner-confirm"
            >
              {t('confirmCta')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={back} className="sm:order-1">
              {t('cancel')}
            </Button>
          </div>
        </>
      }
    >
      {body}

      <GuestPartnerDialog
        key={guestKey}
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        onSave={(name) => void onSaveGuest(name)}
        saving={chooseGuest.isPending}
        error={guestError}
      />
      {e ? (
        <JoinedDialog
          open={joinedOpen}
          onClose={() => {
            setJoinedOpen(false);
            back();
          }}
          thumbnailPath={e.thumbnail_path}
          name={e.name}
          subtitle={eventSubtitle(e.starts_at, place?.name, i18n.language)}
          onCalendar={onCalendar}
          team
          partner={partner}
        />
      ) : null}
    </PartnerPageFrame>
  );
}
