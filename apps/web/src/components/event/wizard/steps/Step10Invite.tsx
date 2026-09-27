'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useFollowing, useGroupMembers, useSearchProfiles } from '@padel/api';
import { guestBlocker } from '@padel/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { GuestDialog } from '../GuestDialog';
import { InfoNote } from '../InfoNote';
import {
  addGuest,
  draftRoster,
  guestIssue,
  guestsAllowed,
  type PickablePlayer,
  removeGuest,
  togglePlayer,
  updateGuest,
} from '../invite-logic';
import type { StepProps } from '../types';

const SEARCH_DEBOUNCE_MS = 300;
const initials = (name: string) => name.slice(0, 2).toUpperCase();

/**
 * Invite players (UX-CEVT-11) — web's twin of mobile's Step10Invite, only on a private event's path
 * (`visibleStepKeys` skips it for a public group event, decision 5).
 *
 *   Search    platform players with photo, name and a checkbox, as on the members screens. Before
 *             anything is typed: the private group's members, or the people you follow.
 *   Guests    "+ Add manually" opens a dialog (name, gender on mixed events) for someone with no
 *             access to the app; they are confirmed on creation and listed here, removable until then.
 *   Capacity  the spots left after the organizer (when playing) and the guests. Adding a guest who
 *             would not fit is refused, not left to fail at create.
 *   Fix-ups   going back can leave guests that no longer work — no gender on an event that became
 *             mixed (click the row to set it), guests on a team event, a roster over capacity. One
 *             warning says which, and Create is refused until it is fixed.
 *   Team      no "+ Add manually": a lone guest cannot hold a team spot without a pair, so guests
 *             join team events as a player's partner (UX-JEVT-10).
 *
 * The wizard's bottom bar carries "Create event" and, under it, "I will invite later".
 */
export function Step10Invite({ draft, patch, organizerGender }: StepProps) {
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  // The guest being corrected (null = adding a new one).
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Bumped on each opening, so the dialog's form starts fresh.
  const [dialogSeq, setDialogSeq] = useState(0);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const mixed = draft.specification === 'mixed';
  const groupId = draft.groupId;
  const canAddGuests = guestsAllowed(draft);
  const room = draftRoster(draft, organizerGender);
  const issue = guestIssue(draft, organizerGender);
  const guests = draft.guests ?? [];
  const editing = editingKey ? guests.find((g) => g.key === editingKey) : undefined;
  // Re-saving the guest being edited must not count them twice.
  const dialogRoom = editing
    ? draftRoster({ ...draft, guests: guests.filter((g) => g.key !== editing.key) }, organizerGender)
    : room;

  // The list before anything is typed: a private group event invites from its group; anything
  // else starts from the people you follow.
  const members = useGroupMembers(groupId);
  const following = useFollowing(groupId ? undefined : uid);
  const found = useSearchProfiles(term);

  const invitees = useMemo(() => draft.invitees ?? [], [draft.invitees]);
  const picked = useMemo(() => new Set(invitees.map((i) => i.invitee_id)), [invitees]);

  const people = useMemo<PickablePlayer[]>(() => {
    const seen = new Set<string>([uid ?? '']);
    const take = (list: PickablePlayer[]) =>
      list.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    if (term) return take((found.data ?? []) as PickablePlayer[]);
    const base: PickablePlayer[] = groupId
      ? (members.data ?? []).map((m) => ({
          id: m.user_id,
          full_name: m.profiles?.full_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
        }))
      : (following.data?.pages.flat() ?? []).map((f) => ({
          id: f.id,
          full_name: f.full_name,
          avatar_url: f.avatar_url,
        }));
    // Anyone picked from an earlier search stays in view, first.
    const earlier = invitees.map((i) => ({ id: i.invitee_id, full_name: i.name ?? null, avatar_url: i.avatarUrl ?? null }));
    return take([...earlier, ...base]);
  }, [term, found.data, groupId, members.data, following.data, invitees, uid]);

  const loading = term ? found.isFetching : groupId ? members.isLoading : following.isLoading;

  const openDialog = (key: string | null = null) => {
    // A full event takes no more guests: say so now instead of opening a form that cannot save.
    if (key == null && guestBlocker(room) === 'event_full') {
      toast(t('guestEventFull'), 'error');
      return;
    }
    setEditingKey(key);
    setDialogSeq((n) => n + 1);
    setDialogOpen(true);
  };

  const spotsLine = room.perGender
    ? t('inviteSpotsLeftMixed', {
        count: Math.max(0, room.remaining),
        men: Math.max(0, room.perGender.male),
        women: Math.max(0, room.perGender.female),
      })
    : t('inviteSpotsLeft', { count: Math.max(0, room.remaining) });

  const listTitle = term ? t('inviteResultsTitle') : groupId ? t('inviteFromGroup') : t('inviteFollowingTitle');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex-1 text-sm text-muted-foreground" aria-live="polite" data-testid="invite-capacity">
          {spotsLine}
        </p>
        {canAddGuests ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => openDialog()} data-testid="invite-add-manually">
            {t('inviteAddManually')}
          </Button>
        ) : null}
      </div>

      {!canAddGuests ? (
        <p className="text-sm text-muted-foreground" data-testid="invite-team-guest-note">
          {t('inviteTeamGuestNote')}
        </p>
      ) : null}

      {issue === 'capacity' ? (
        <InfoNote tone="warning" text={t('inviteOverCapacity')} testId="invite-over-capacity" />
      ) : issue === 'gender' ? (
        <InfoNote tone="warning" text={t('inviteGuestGenderMissing')} testId="invite-guest-gender-missing" />
      ) : issue === 'team' ? (
        <InfoNote tone="warning" text={t('inviteTeamGuestsRemove')} testId="invite-team-guests" />
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('inviteSearchPlaceholder')}
          aria-label={t('inviteSearchPlaceholder')}
          autoComplete="off"
          className="pl-9"
          data-testid="invite-search"
        />
      </div>

      {guests.length > 0 ? (
        <section className="flex flex-col gap-1" aria-labelledby="invite-confirmed-title">
          <h2 id="invite-confirmed-title" className="text-xs font-medium uppercase text-muted-foreground">
            {t('inviteConfirmedTitle', { count: guests.length })}
          </h2>
          <ul className="flex flex-col">
            {guests.map((g, i) => {
              // On a mixed event a guest with no gender is marked, and the row reopens the dialog.
              const needsGender = mixed && !g.gender;
              const subtitle = needsGender
                ? `${t('inviteGuestTag')} · ${t('inviteGuestSetGender')}`
                : g.gender
                  ? `${t('inviteGuestTag')} · ${g.gender === 'male' ? t('genderMale') : t('genderFemale')}`
                  : t('inviteGuestTag');
              const body = (
                <>
                  <Avatar className="size-9" aria-hidden>
                    <AvatarFallback className="text-xs">{initials(g.name)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{g.name}</span>
                    <span className={cn('text-xs', needsGender ? 'text-destructive' : 'text-muted-foreground')}>
                      {subtitle}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={g.key} className="flex items-center gap-2" data-testid={`invite-guest-row-${i}`}>
                  {mixed ? (
                    <button
                      type="button"
                      onClick={() => openDialog(g.key)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      data-testid={`invite-guest-edit-${i}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2">{body}</div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('inviteRemoveGuest', { name: g.name })}
                    onClick={() => patch({ guests: removeGuest(draft.guests, g.key) })}
                    data-testid={`invite-guest-remove-${i}`}
                  >
                    {t('removeCta')}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-1" aria-labelledby="invite-people-title">
        <h2 id="invite-people-title" className="text-xs font-medium uppercase text-muted-foreground">
          {listTitle}
        </h2>
        {loading && people.length === 0 ? (
          <Skeleton className="h-24 w-full" />
        ) : people.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
            data-testid={term ? 'empty-invite-search' : 'empty-invite-default'}
          >
            {term ? (
              <Search className="size-6 text-muted-foreground" aria-hidden />
            ) : (
              <Users className="size-6 text-muted-foreground" aria-hidden />
            )}
            <p className="text-sm font-medium">{term ? t('inviteNoResultsTitle') : t('inviteNobodyTitle')}</p>
            <p className="text-sm text-muted-foreground">{term ? t('inviteNoResultsBody') : t('inviteNobodyBody')}</p>
            {term && canAddGuests ? (
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => openDialog()}>
                {t('inviteAddManually')}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col">
            {people.map((p) => {
              const name = p.full_name ?? '—';
              const checked = picked.has(p.id);
              return (
                <li key={p.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50',
                      checked && 'bg-primary/5',
                    )}
                    data-testid={`invite-row-${p.id}`}
                  >
                    <Avatar className="size-9" aria-hidden>
                      <AvatarImage src={avatarUrl(p.avatar_url) ?? undefined} alt="" />
                      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={checked}
                      onChange={() => patch({ invitees: togglePlayer(draft.invitees, p) })}
                      data-testid={`invite-check-${p.id}`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {/* The followed list pages on a click rather than on scroll. */}
        {!term && !groupId && following.hasNextPage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={following.isFetchingNextPage}
            onClick={() => void following.fetchNextPage()}
            data-testid="invite-show-more"
          >
            {t('inviteShowMore')}
          </Button>
        ) : null}
      </section>

      <GuestDialog
        open={dialogOpen}
        formKey={dialogSeq}
        onClose={() => setDialogOpen(false)}
        mixed={mixed}
        room={dialogRoom}
        initial={editing ? { name: editing.name, gender: editing.gender } : undefined}
        onSave={(guest) => {
          patch({
            guests: editing
              ? updateGuest(draft.guests, editing.key, guest, mixed)
              : addGuest(draft.guests, guest, `${Date.now()}-${guests.length}`, mixed),
          });
          setDialogOpen(false);
        }}
      />
    </div>
  );
}
