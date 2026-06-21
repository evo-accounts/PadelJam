'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCommunities, useCommunityPermissions, useUpdatePermissions } from '@padel/api';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

type PermCol = 'invite_members' | 'approve_join_requests' | 'create_posts';

const rows: { labelKey: 'permInvite' | 'permApprove' | 'permCreatePosts'; col: PermCol }[] = [
  { labelKey: 'permInvite', col: 'invite_members' },
  { labelKey: 'permApprove', col: 'approve_join_requests' },
  { labelKey: 'permCreatePosts', col: 'create_posts' },
];

export default function ManagePermissionsPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useCommunities();
  const perms = useCommunityPermissions(id);
  const update = useUpdatePermissions(id);

  const [override, setOverride] = useState<Partial<Record<PermCol, boolean>>>({});
  const [saveError, setSaveError] = useState(false);

  const role = (mine.data ?? []).find((r) => r.community?.id === id)?.role;
  const isAdmin = role === 'owner' || role === 'admin';
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isAdmin) router.replace(`/app/community/${id}`);
  }, [mine.isLoading, mine.data, isAdmin, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isAdmin) return null;

  if (perms.isLoading) return <Skeleton className="m-6 h-40" />;

  const value = (col: PermCol): boolean =>
    override[col] ?? (perms.data?.[col] as boolean | undefined) ?? false;

  const toggle = (col: PermCol) => {
    const next = !value(col);
    setSaveError(false);
    setOverride((o) => ({ ...o, [col]: next }));
    update.mutate(
      { [col]: next },
      {
        onError: () => {
          setOverride((o) => {
            const { [col]: _drop, ...rest } = o;
            return rest;
          });
          setSaveError(true);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('permissions')}</h1>

      <Card className="divide-y p-0">
        {rows.map((r) => (
          <div key={r.col} className="flex items-center justify-between px-6 py-4">
            <span className="text-sm font-medium">{t(r.labelKey)}</span>
            <Switch checked={value(r.col)} onCheckedChange={() => toggle(r.col)} />
          </div>
        ))}
      </Card>

      {saveError ? <p className="text-sm text-destructive">{t('saveError')}</p> : null}
    </div>
  );
}
