'use client';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { FollowList } from '@/components/profile/FollowList';

export default function FollowingPage() {
  const { t } = useT('profile');
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">{t('following')}</h1>
      <FollowList kind="following" userId={id} />
    </div>
  );
}
