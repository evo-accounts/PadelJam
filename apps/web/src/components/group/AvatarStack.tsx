'use client';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

type Person = { id: string; name: string | null; avatarPath: string | null };

const SHOWN = 5;

/**
 * Overlapping avatars and a player count on one line (UX-GLOB-04, UX-GRP-02/04) — web's twin of
 * mobile's `AvatarStack`. With `href` the whole line opens the members list.
 */
export function AvatarStack({ people, countLabel, href }: { people: Person[]; countLabel: string; href?: string }) {
  const body = (
    <>
      {people.length > 0 ? (
        <AvatarGroup>
          {people.slice(0, SHOWN).map((p) => (
            <Avatar key={p.id} className="size-8">
              <AvatarImage src={avatarUrl(p.avatarPath) ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{(p.name ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          ))}
        </AvatarGroup>
      ) : null}
      <span className="text-sm font-medium">{countLabel}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 rounded-md hover:opacity-80" data-testid="group-members-line">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3">{body}</div>
  );
}
