'use client';
/**
 * Blocked users (UX-SET-06), the web half.
 *
 * The list cannot read `profiles`: migration 0055's read policy hides a row when a block exists in
 * EITHER direction, so the blocker cannot see the person they blocked any more than the other way
 * round. `list_my_blocks` (migration 0102) is a security-definer function scoped to
 * `blocker_id = auth.uid()` that returns exactly the name and avatar these rows render.
 *
 * The search input is hidden when there are no blocks AT ALL — gated on that rather than on the
 * current result, so typing a term that matches nothing does not remove the box you were typing
 * into.
 */
import { useEffect, useState } from 'react';
import { useT } from '@padel/i18n';
import { useMyBlocks, useUnblock } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function BlockedUsersPage() {
  const { t } = useT('settings');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const unblock = useUnblock();

  // Debounce the raw input into the query term so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const q = useMyBlocks(search);
  const rows = q.data ?? [];
  const hasAny = search.trim().length > 0 || rows.length > 0;

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('blockedTitle')}</h1>

      {hasAny ? (
        <Input
          placeholder={t('blockedSearch')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      ) : null}

      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-10 text-center">
            {/* A search that matched nothing is NOT an empty blocked list. Saying "you haven't
                blocked anyone" to someone who has, and is looking at the search box they typed
                into, tells them something false about their own account. */}
            {search.trim().length > 0 ? (
              <p className="font-medium">{t('blockedNoResults')}</p>
            ) : (
              <>
                <p className="font-medium">{t('blockedEmpty')}</p>
                <p className="text-sm text-muted-foreground">{t('blockedEmptyBody')}</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => {
            const initials = (row.full_name ?? '?').slice(0, 2).toUpperCase();
            return (
              <li key={row.id} className="flex items-center gap-3 rounded-md p-2">
                <Avatar className="size-10">
                  <AvatarImage src={avatarUrl(row.avatar_url) ?? undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                {/* Not a link: the profile behind it is still hidden by row-level security until
                    the unblock lands, so it would only reach a dead end. */}
                <span className="min-w-0 flex-1 truncate font-medium">{row.full_name}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate(row.id)}
                >
                  {t('unblock')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
