'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useEvent } from '@padel/api';
import { BlastComposer } from '@/components/event/manage/BlastComposer';
import { BlastHistory } from '@/components/event/manage/BlastHistory';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventBlastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);

  const isOrganizer = event.data != null && event.data.organizer_id === uid;
  useEffect(() => {
    if (!event.isLoading && event.data && !isOrganizer) router.replace(`/app/event/${id}`);
  }, [event.isLoading, event.data, isOrganizer, id, router]);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data || !isOrganizer) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('blastTitle')}</h1>
        <Button asChild variant="tertiary">
          <Link href={`/app/event/${id}/manage`}>{t('manageEventTitle')}</Link>
        </Button>
      </div>
      <BlastComposer eventId={id} />
      <BlastHistory eventId={id} />
    </div>
  );
}
