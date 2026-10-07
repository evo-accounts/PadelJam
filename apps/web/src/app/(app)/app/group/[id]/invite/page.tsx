'use client';
/**
 * Invite members (UX-GRP-08) — web's twin of mobile's `app/group/[id]/invite.tsx`. Share and Copy
 * link first (a link reaches people with no account), then "or" and a search.
 *
 * Who is listed, in this order:
 *   Community members   of the parent community, not in the group
 *   My connections      people the viewer follows, not already listed above
 *   Other people        anyone else, only once a name is typed
 * Several can be picked at once; the button says how many.
 *
 * Anyone outside the community is added to BOTH on accepting (accept_group_invitation records the
 * community entry). When the selection includes such a person a dialog says so before anything is
 * sent; otherwise the invites go straight out.
 *
 * Only for whoever may invite (0107's may_invite_to_group); anyone else is sent to the group page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import {
  useCanInviteToGroup,
  useCommunity,
  useCommunityMembers,
  useFollowing,
  useGroup,
  useGroupMemberList,
  useInviteToGroup,
  useSearchProfiles,
  inviteNotice,
  type InviteNotice,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { GroupConfirm } from '@/components/group/GroupConfirm';
import { GroupEmpty } from '@/components/group/GroupEmpty';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { copyGroupLink, shareGroup, useCanNativeShare } from '@/lib/groupShare';
import { avatarUrl } from '@/lib/upload';

type Person = { id: string; full_name: string | null; avatar_url: string | null };
type Section = { key: 'community' | 'connections' | 'others'; title: string; data: Person[] };

export default function GroupInvitePage() {
  const { t } = useT('group');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const { id } = useParams<{ id: string }>();
  const canNativeShare = useCanNativeShare();

  const { data: group } = useGroup(id);
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);
  const { data: people } = useGroupMemberList(id);
  const { data: canInvite, isLoading: checking } = useCanInviteToGroup(id);
  const invite = useInviteToGroup(id);

  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, Person>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data: following } = useFollowing(uid, term);
  const { data: found, isFetching } = useSearchProfiles(term);

  // Nobody without the right to invite should be here; a pasted link goes to the group page.
  useEffect(() => {
    if (!checking && canInvite === false) router.replace(`/app/group/${id}`);
  }, [checking, canInvite, router, id]);

  const inGroup = useMemo(
    () => new Set((people ?? []).filter((p) => p.is_member).map((p) => p.user_id)),
    [people],
  );
  const inCommunity = useMemo(() => new Set((communityMembers ?? []).map((m) => m.user_id)), [communityMembers]);

  const sections = useMemo<Section[]>(() => {
    const q = term.trim().toLowerCase();
    const matches = (name: string | null) => q.length === 0 || (name ?? '').toLowerCase().includes(q);
    const seen = new Set<string>([...inGroup, uid ?? '']);
    const take = (list: Person[]) =>
      list.filter((p) => {
        if (seen.has(p.id) || !matches(p.full_name)) return false;
        seen.add(p.id);
        return true;
      });
    // A member blocked either way with the viewer comes back with `profiles: null`: 0140 hides the
    // profile row, but "community_members: read" (0024) has no block clause. Listed, they showed as
    // "—", could be picked, and invite_to_group refuses them ('blocked', 0141), so they are left
    // out. `inCommunity` keeps them on purpose: they are still members, not outsiders.
    const communityPeople = take(
      (communityMembers ?? []).filter((m) => m.profiles).map((m) => ({
        id: m.user_id,
        full_name: m.profiles?.full_name ?? null,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    );
    const connections = take(
      (following?.pages.flat() ?? []).map((f) => ({ id: f.id, full_name: f.full_name, avatar_url: f.avatar_url })),
    );
    const others = q.length > 0 ? take((found ?? []) as Person[]) : [];
    return [
      { key: 'community' as const, title: t('inviteSectionCommunity'), data: communityPeople },
      { key: 'connections' as const, title: t('inviteSectionConnections'), data: connections },
      { key: 'others' as const, title: t('inviteSectionOthers'), data: others },
    ].filter((s) => s.data.length > 0);
  }, [term, inGroup, uid, communityMembers, following, found, t]);

  const selectedList = Object.values(selected);
  const outsiders = selectedList.filter((p) => !inCommunity.has(p.id));

  const toggle = (p: Person) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  // The whole selection in one mutation: someone blocked either way (0141) is skipped and counted
  // instead of stopping everyone after them. Which message that earns, and with what count, is
  // inviteNotice's call (packages/api, shared with mobile and tested there).
  const send = async () => {
    setSending(true);
    const notify = (n: InviteNotice) =>
      toast(t(n.key, { count: n.count, defaultValue: t('unknown_error') }), n.tone);
    try {
      const outcome = await invite.mutateAsync(selectedList.map((p) => p.id));
      setConfirming(false);
      notify(inviteNotice({ outcome }, selectedList.length, 'inviteSentToast'));
      router.push(`/app/group/${id}`);
    } catch (error) {
      notify(inviteNotice({ error }, selectedList.length, 'inviteSentToast'));
    } finally {
      setSending(false);
    }
  };
  const onSubmit = () => (outsiders.length > 0 ? setConfirming(true) : void send());

  const onShare = async () => {
    try {
      const how = await shareGroup(id, group?.name ?? '');
      if (how === 'copied') toast(t('linkCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };
  const onCopy = async () => {
    try {
      await copyGroupLink(id);
      toast(t('linkCopied'));
    } catch {
      toast(t('copyFailed'), 'error');
    }
  };

  if (checking || !canInvite) return <Skeleton className="m-6 h-40" />;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
      <div className="flex flex-col gap-4 p-4">
        <GroupPageTitle title={t('inviteTitle')} fallbackHref={`/app/group/${id}`} subtitle={group?.name} />
        <div className="flex gap-3">
          {canNativeShare ? (
            <Button variant="secondary" className="flex-1" onClick={() => void onShare()} data-testid="group-invite-share">
              {t('shareCta')}
            </Button>
          ) : null}
          <Button variant="secondary" className="flex-1" onClick={() => void onCopy()} data-testid="group-invite-copy">
            {t('copyLinkCta')}
          </Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t('orDivider')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('inviteSearchPlaceholder')}
          aria-label={t('inviteSearchPlaceholder')}
          autoComplete="off"
          data-testid="group-invite-search"
        />
        {selectedList.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedList.map((p) => {
              const name = p.full_name ?? '—';
              return (
                <Badge key={p.id} variant="secondary" className="gap-1 py-1 pr-1">
                  {name}
                  <button
                    type="button"
                    onClick={() => toggle(p)}
                    aria-label={t('removeSelected', { name })}
                    className="rounded-full p-0.5 hover:bg-background"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        ) : null}

        {sections.length === 0 ? (
          isFetching ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <GroupEmpty
              title={term.trim() ? t('inviteNoResults') : t('inviteSearchHint')}
              testId="empty-group-invite"
            />
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
                        data-testid={`group-invite-row-${p.id}`}
                      >
                        <Avatar className="size-9">
                          <AvatarImage src={avatarUrl(p.avatar_url) ?? undefined} alt="" />
                          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={!!selected[p.id]}
                          onChange={() => toggle(p)}
                          data-testid={`group-invite-check-${p.id}`}
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
          disabled={selectedList.length === 0 || sending}
          onClick={onSubmit}
          data-testid="group-invite-submit"
        >
          {t('inviteCta', { count: selectedList.length })}
        </Button>
      </div>

      <GroupConfirm
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('inviteBothTitle')}
        body={t('inviteBothBody', { count: outsiders.length, community: community?.name ?? '' })}
        confirmLabel={t('inviteCta', { count: selectedList.length })}
        cancelLabel={t('cancel')}
        busy={sending}
        onConfirm={send}
      />
    </div>
  );
}
