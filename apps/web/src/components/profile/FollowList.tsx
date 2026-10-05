'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useFollowers, useFollowing } from '@padel/api';
import { ProfileActionsMenu } from './ProfileActionsMenu';
import { FollowButton } from './FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export function FollowList({
  kind,
  userId,
}: {
  kind: 'followers' | 'following';
  userId: string;
}) {
  const { t } = useT('profile');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the raw input into the query term so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Call both hooks unconditionally to respect the rules of hooks; only the active
  // one receives the search term.
  const followers = useFollowers(userId, kind === 'followers' ? search : '');
  const following = useFollowing(userId, kind === 'following' ? search : '');
  const q = kind === 'followers' ? followers : following;

  const rows = q.data?.pages.flat() ?? [];

  return (
    <div className="space-y-4">
      <Input
        placeholder={t('searchPeople')}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {t(kind === 'followers' ? 'emptyFollowers' : 'emptyFollowing')}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const initials = (row.full_name ?? '?').slice(0, 2).toUpperCase();
            return (
              <li key={row.id} className="flex items-center gap-2 rounded-md p-2 hover:bg-accent">
                {/* The row is still a link to the profile, but the controls are NOT inside it —
                    nesting a button in an anchor makes the whole row navigate on every click. */}
                <Link href={`/app/profile/${row.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={avatarUrl(row.avatar_url) ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium">{row.full_name ?? '—'}</span>
                </Link>
                {/* Reflects the VIEWER's relationship with this person, not the list owner's —
                    the flags come from 0102 computed against auth.uid(), so browsing someone
                    else's followers still says "Unfollow" beside the people you already follow. */}
                <FollowButton targetId={row.id} isFollowing={row.is_following} size="sm" />
                <ProfileActionsMenu
                  person={{ id: row.id, full_name: row.full_name, is_following: row.is_following }}
                />
              </li>
            );
          })}
        </ul>
      )}

      {q.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
