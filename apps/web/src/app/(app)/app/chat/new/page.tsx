'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useFollowing } from '@padel/api';
import { useSession } from '@padel/auth';
import { streamClient } from '@/lib/streamClient';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function NewChatPage() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const following = useFollowing(uid);
  const [busy, setBusy] = useState(false);

  const rows = following.data?.pages.flat() ?? [];

  const onPick = async (otherId: string) => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const ch = streamClient.channel('messaging', { members: [uid, otherId] });
      await ch.watch();
      router.push(`/app/chat/${encodeURIComponent(ch.cid)}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">{t('newMessage')}</h1>
      {following.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noFollowing')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((u) => {
            const name = u.full_name ?? '—';
            return (
              <button
                key={u.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(u.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 disabled:opacity-50"
              >
                <Avatar className="size-9">
                  <AvatarImage src={avatarUrl(u.avatar_url) ?? undefined} />
                  <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm font-medium">{name}</span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
