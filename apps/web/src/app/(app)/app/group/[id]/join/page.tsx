'use client';
/**
 * A group invitation (UX-GRP-02) — where a `group_invite` notification leads (notificationRoute →
 * /group/[id]/join). Web's twin of mobile's `app/group/[id]/join.tsx`. For a PRIVATE group this is
 * the only way in: the group stays invisible until accepted, so the page reads
 * group_invitation_preview (0110) — identity and context, never events or ranking:
 *
 *   header   back, thumbnail, name, description
 *   Private Group label and what it means (private only)
 *   avatars and player count, the parent community, the creation date
 *   bottom   who invited you, above Decline (secondary) and Accept (primary)
 *
 * With no invitation to answer, a public group's visitor is sent to the group page (its own
 * preview, with "Join group"); a private one shows no access. Accepting also brings you into the
 * community, so one with rules asks for them here first (UX-COMM-05), as its own Join does.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useAcceptGroupInvitation,
  useCommunities,
  useCommunity,
  useDeclineGroupInvitation,
  useGroup,
  useGroupInvitationPreview,
  useGroupMemberList,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { AvatarStack } from '@/components/group/AvatarStack';
import { GroupHeader } from '@/components/group/GroupHeader';
import { GroupThumb } from '@/components/group/GroupThumb';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { avatarUrl } from '@/lib/upload';

export default function GroupInvitationPage() {
  const { t, i18n } = useT('group');
  const { t: tc } = useT('community');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const { id } = useParams<{ id: string }>();

  const { data: preview, isLoading } = useGroupInvitationPreview(id);
  // Errors for a private group the viewer cannot see; that is "no group", not a failure.
  const { data: group, isLoading: loadingGroup } = useGroup(id);
  const { data: people } = useGroupMemberList(group ? id : null);
  const { data: community } = useCommunity(preview?.community_id);
  const { data: memberships } = useCommunities();
  const accept = useAcceptGroupInvitation();
  const decline = useDeclineGroupInvitation();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = isLoading || loadingGroup;
  const isMember = (people ?? []).some((p) => p.user_id === uid && p.is_member);
  // Already in, or nothing to answer for a group that is its own preview: go to the group page.
  const redirectToGroup = !loading && (isMember || (!preview && !!group && !group.is_private));
  useEffect(() => {
    if (redirectToGroup) router.replace(`/app/group/${id}`);
  }, [redirectToGroup, router, id]);

  if (loading || redirectToGroup) return <Skeleton className="m-6 h-40" />;

  if (!preview) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold">{t('noAccessTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('noAccessBody')}</p>
        <Button variant="secondary" asChild>
          <Link href="/app/groups">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  const inCommunity = (memberships ?? []).some((m) => m.community?.id === preview.community_id);
  const rulesText = community?.cancellation_rules_enabled ? (community.cancellation_rules_text ?? '') : '';
  const needsAck = !inCommunity && !!community?.cancellation_rules_enabled;

  const onAccept = async () => {
    setError(null);
    try {
      await accept.mutateAsync({ groupId: id, communityId: preview.community_id, ack });
      toast(t('joinedToast', { name: preview.name }));
      router.replace(`/app/group/${id}`);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };
  const onDecline = async () => {
    setError(null);
    try {
      await decline.mutateAsync(id);
      toast(t('declinedToast'));
      router.replace('/app/groups');
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const created = new Date(preview.created_at).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex min-h-full flex-col">
      <GroupHeader
        name={preview.name}
        description={preview.description}
        thumbnailPath={preview.thumbnail_path}
        fallbackHref="/app/groups"
      />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4">
        {preview.is_private ? (
          <div className="flex flex-col items-start gap-2">
            <Badge variant="secondary">{t('privateGroupLabel')}</Badge>
            <p className="text-sm text-muted-foreground">{t('privateGroupExplain')}</p>
          </div>
        ) : null}

        <AvatarStack
          people={preview.members.map((m) => ({ id: m.id, name: m.full_name, avatarPath: m.avatar_url }))}
          countLabel={t('playersCount', { count: preview.member_count })}
        />

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <GroupThumb path={preview.community_thumb} name={preview.community_name} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{preview.community_name}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t('createdOn', { date: created })}</p>

        {needsAck ? (
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              {tc('ackRules')}
              {rulesText ? <span className="mt-1 block whitespace-pre-line text-xs">{rulesText}</span> : null}
            </span>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t bg-background p-4">
        {preview.inviter_name ? (
          <div className="flex items-center gap-2">
            <Avatar className="size-8">
              <AvatarImage src={avatarUrl(preview.inviter_avatar) ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{preview.inviter_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{t('invitedBy', { name: preview.inviter_name })}</span>
          </div>
        ) : null}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={decline.isPending || accept.isPending}
            onClick={() => void onDecline()}
            data-testid="group-invite-decline"
          >
            {t('declineCta')}
          </Button>
          <Button
            className="flex-1"
            disabled={accept.isPending || decline.isPending || (needsAck && !ack)}
            onClick={() => void onAccept()}
            data-testid="group-invite-accept"
          >
            {t('acceptCta')}
          </Button>
        </div>
      </div>
    </div>
  );
}
