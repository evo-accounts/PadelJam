'use client';
/**
 * Invite players (UX-MEVT-13) — web's twin of mobile's `app/event/[id]/invite.tsx`, from the
 * "+ Invite" in Manage players on a private group event or a group-less one. A public group event
 * has no invite action — every member may already join — and a pasted link lands on a
 * "not available" state.
 *
 * Who is listed comes from `event_invite_candidates` (0122, plan D12), already sectioned:
 *   group event      Group members not yet invited or playing
 *   group-less event My connections (mutual follows), Following, then — only once a name is
 *                    typed — Others
 * Several can be picked; "Send invite" is fixed at the bottom. Someone who is not on the app is
 * added as a guest instead: "Add manually" sits under the search, and is the empty state's CTA.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent,
  useEventInviteCandidates,
  useInviteToEvent,
  type InviteCandidate,
  type InviteCandidateSection,
} from '@padel/api';
import { AddManualDialog } from '@/components/event/manage/AddManualDialog';
import { isPublicGroupEvent, rosterErrorKey } from '@/components/event/manage/manageRoster';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';

const SECTION_ORDER: InviteCandidateSection[] = ['members', 'connections', 'following', 'others'];
const SECTION_TITLE: Record<InviteCandidateSection, string> = {
  members: 'mpSectionMembers',
  connections: 'mpSectionConnections',
  following: 'mpSectionFollowing',
  others: 'mpSectionOthers',
};

export default function EventInvitePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const invite = useInviteToEvent(id);

  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, InviteCandidate>>({});
  const [addingManual, setAddingManual] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const e = event.data;
  const organizer = e != null && uid != null && uid === e.organizer_id;
  const allowed = organizer && !isPublicGroupEvent(e) && e.status === 'scheduled';
  const candidates = useEventInviteCandidates(allowed ? id : '', term);

  const sections = useMemo(() => {
    const rows = candidates.data ?? [];
    return SECTION_ORDER.map((key) => ({ key, title: t(SECTION_TITLE[key]), data: rows.filter((r) => r.section === key) })).filter(
      (s) => s.data.length > 0,
    );
  }, [candidates.data, t]);

  const playersHref = `/app/event/${id}/manage/players`;
  const title = <GroupPageTitle title={t('mpInviteTitle')} fallbackHref={playersHref} />;

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!allowed) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        {title}
        <div className="flex flex-col items-center gap-1 p-8 text-center" data-testid="event-invite-unavailable">
          <p className="text-sm font-medium">{organizer ? t('mpInviteNotAvailable') : t('forbidden')}</p>
          {e != null && organizer && isPublicGroupEvent(e) ? (
            <p className="text-sm text-muted-foreground">{t('invites_not_allowed')}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const mixed = e.specification === 'mixed';
  const selectedList = Object.values(selected);
  const toggle = (p: InviteCandidate) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  const send = async () => {
    try {
      await invite.mutateAsync(selectedList.map((p) => ({ invitee_id: p.id })));
      toast(t('mpInviteSentToast', { count: selectedList.length }));
      router.push(playersHref);
    } catch (x) {
      const code = x instanceof Error ? x.message : 'unknown_error';
      toast(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }), 'error');
    }
  };

  const searching = candidates.isFetching && (candidates.data ?? []).length === 0;
  const typed = term.trim().length > 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {title}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={t('mpInviteSearch')}
            aria-label={t('mpInviteSearch')}
            autoComplete="off"
            className="pl-9"
            data-testid="event-invite-search"
          />
        </div>
        <Button
          variant="tertiary"
          className="self-start"
          onClick={() => setAddingManual(true)}
          data-testid="event-invite-add-manually"
        >
          {t('addManuallyShort')}
        </Button>

        {sections.length === 0 ? (
          searching ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"
              data-testid="event-invite-empty"
            >
              <Search className="size-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">{typed ? t('mpInviteNoResults') : t('mpInviteNobody')}</p>
              <p className="text-sm text-muted-foreground">
                {typed ? t('mpInviteNoResultsBody') : t(e.group_id ? 'mpInviteNobodyGroupBody' : 'mpInviteNobodyBody')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-1"
                onClick={() => setAddingManual(true)}
                data-testid="event-invite-empty-add"
              >
                {t('addManuallyCta')}
              </Button>
            </div>
          )
        ) : (
          sections.map((s) => (
            <section key={s.key} className="flex flex-col gap-1" aria-labelledby={`invite-section-${s.key}`}>
              <h2 id={`invite-section-${s.key}`} className="text-xs font-medium uppercase text-muted-foreground">
                {s.title}
              </h2>
              <ul className="flex flex-col">
                {s.data.map((p) => {
                  const name = p.full_name ?? '—';
                  return (
                    <li key={p.id}>
                      <label
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                        data-testid={`event-invite-row-${p.id}`}
                      >
                        <Avatar className="size-9">
                          <AvatarImage src={avatarUrl(p.avatar_url) ?? undefined} alt="" />
                          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={!!selected[p.id]}
                          onChange={() => toggle(p)}
                          data-testid={`event-invite-check-${p.id}`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="sticky bottom-0 mt-auto border-t bg-background p-4">
        <Button
          className="w-full"
          size="lg"
          disabled={selectedList.length === 0 || invite.isPending}
          aria-busy={invite.isPending || undefined}
          onClick={() => void send()}
          data-testid="event-invite-send"
        >
          {selectedList.length > 1 ? t('mpSendInvites', { n: selectedList.length }) : t('mpSendInvite')}
        </Button>
      </div>

      {addingManual ? (
        <AddManualDialog
          eventId={id}
          mixed={mixed}
          onClose={() => setAddingManual(false)}
          onAdded={(name) => {
            setAddingManual(false);
            toast(t('mpManualAddedToast', { name }));
            // Back to Manage players, where the guest is on the Confirmed tab.
            router.push(playersHref);
          }}
        />
      ) : null}
    </div>
  );
}
