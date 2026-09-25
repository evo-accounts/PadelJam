'use client';
/**
 * Group settings (UX-GRP-11): the Create group form, with no community selector — a group never
 * moves between communities. Saving returns to the group page with a toast (UX-GLOB-06). Only for
 * the group's admins; anyone else is sent to the group page.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCommunityMembers, useGroup, useGroupMemberList, useUpdateGroup } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { GroupComposer, type GroupComposerValues } from '@/components/group/GroupComposer';
import { GroupPageTitle } from '@/components/group/GroupHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { communityImageUrl } from '@/lib/community-images';
import { uploadCommunityImage } from '@/lib/upload';

export default function GroupSettingsPage() {
  const { t } = useT('group');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const { id } = useParams<{ id: string }>();
  const group = useGroup(id);
  const communityMembers = useCommunityMembers(group.data?.community_id);
  const people = useGroupMemberList(id);
  const update = useUpdateGroup(id, group.data?.community_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const checking = !uid || group.isLoading || communityMembers.isLoading || people.isLoading;
  const isMember = (people.data ?? []).some((p) => p.user_id === uid && p.is_member);
  const isCommunityAdmin = (communityMembers.data ?? []).some((m) => m.user_id === uid && m.role === 'admin');
  const isAdmin = isCommunityAdmin && (!group.data?.is_private || isMember);
  useEffect(() => {
    if (!checking && !isAdmin) router.replace(`/app/group/${id}`);
  }, [checking, isAdmin, id, router]);

  if (checking || !isAdmin || !group.data) return <Skeleton className="m-6 h-40" />;
  const g = group.data;

  const onSubmit = async (values: GroupComposerValues) => {
    setError(null);
    setSaving(true);
    try {
      let thumbnailPath = values.removeThumbnail ? null : (g.thumbnail_path ?? null);
      if (values.file) thumbnailPath = await uploadCommunityImage(values.file, id, 'community-thumbnails');
      await update.mutateAsync({
        name: values.name,
        description: values.description ?? null,
        is_private: values.isPrivate,
        thumbnail_path: thumbnailPath,
      });
      toast(t('savedToast'));
      router.push(`/app/group/${id}`);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-4">
      <GroupPageTitle title={t('editTitle')} fallbackHref={`/app/group/${id}`} subtitle={g.name} />
      <GroupComposer
        initial={{
          name: g.name,
          description: g.description,
          isPrivate: g.is_private,
          thumbnailUrl: communityImageUrl(g.thumbnail_path, 'community-thumbnails'),
        }}
        submitting={saving}
        submitLabel={t('saveCta')}
        onSubmit={(v) => void onSubmit(v)}
        error={error}
      />
    </div>
  );
}
