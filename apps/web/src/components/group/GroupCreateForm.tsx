'use client';
/**
 * Create group (UX-GRP-01) — web's twin of mobile's GroupCreateScreen, behind two routes:
 *
 *   /app/community/[id]/group-create   the community is fixed: the group belongs there
 *   /app/groups/create                 from Your Groups; the community is chosen, with a selector
 *                                      only when the user may create in more than one
 *
 * Both are gated on permission alone (decision 6, may_create_group): hitting the plan's group
 * limit is explained here, on submit, rather than by a button that silently is not there.
 * On success the new group opens with a toast.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommunities, useCreatableCommunities, useCreateGroup, useDb, useMayCreateGroup } from '@padel/api';
import { useT } from '@padel/i18n';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { uploadCommunityImage } from '@/lib/upload';
import { GroupComposer, type GroupComposerValues } from './GroupComposer';
import { GroupPageTitle } from './GroupHeader';

export function GroupCreateForm({ communityId: fixedCommunityId }: { communityId?: string }) {
  const { t } = useT('group');
  const router = useRouter();
  const db = useDb();
  const create = useCreateGroup();

  const { communities: creatable, isLoading: loadingCreatable } = useCreatableCommunities();
  const fixedAllowed = useMayCreateGroup(fixedCommunityId);
  const [picked, setPicked] = useState<string | null>(null);
  const communityId = fixedCommunityId ?? picked ?? (creatable.length === 1 ? creatable[0]!.id : null);
  const showSelector = !fixedCommunityId && creatable.length > 1;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useCommunities waits for the session and reports "not loading" until then, so "no data yet"
  // counts as checking too — otherwise a hard load of this page bounced straight back.
  const { data: memberships } = useCommunities();
  const checking = fixedCommunityId ? fixedAllowed.isLoading : loadingCreatable || memberships === undefined;
  const allowed = fixedCommunityId ? fixedAllowed.data === true : creatable.length > 0;
  const back = fixedCommunityId ? `/app/community/${fixedCommunityId}` : '/app/groups';
  useEffect(() => {
    if (!checking && !allowed) router.replace(back);
  }, [checking, allowed, back, router]);

  const onSubmit = async (values: GroupComposerValues) => {
    if (!communityId) {
      setError(t('pickCommunityFirst'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const newId = (await create.mutateAsync({
        communityId,
        name: values.name,
        description: values.description,
        isPrivate: values.isPrivate,
      })) as string;
      // The group exists now; the thumbnail is optional, so a failed upload must not strand the
      // user here with a "create failed" error. They can set it later in Group settings.
      if (values.file) {
        try {
          const path = await uploadCommunityImage(values.file, newId, 'community-thumbnails');
          await db.from('groups').update({ thumbnail_path: path }).eq('id', newId);
        } catch {
          /* group created; thumbnail can be added later */
        }
      }
      toast(t('createdToast', { name: values.name }));
      router.replace(`/app/group/${newId}`);
    } catch (e) {
      // groups_per_community carries the plan-limit explanation (web has no plan page to link to).
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
      setSubmitting(false);
    }
  };

  if (checking || !allowed) return <Skeleton className="m-6 h-40" />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4">
      <GroupPageTitle title={t('createTitle')} fallbackHref={back} />
      <GroupComposer
        submitting={submitting}
        submitLabel={t('createCta')}
        onSubmit={(v) => void onSubmit(v)}
        error={error}
        before={
          showSelector ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-community">{t('communityLabel')}</Label>
              <Select
                value={communityId ?? undefined}
                onValueChange={(v) => {
                  setPicked(v);
                  setError(null);
                }}
              >
                <SelectTrigger id="group-community" className="w-full" data-testid="group-create-community">
                  <SelectValue placeholder={t('pickCommunity')} />
                </SelectTrigger>
                <SelectContent>
                  {creatable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      />
    </div>
  );
}
