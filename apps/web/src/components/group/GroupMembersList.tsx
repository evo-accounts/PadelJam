'use client';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

interface GroupMember {
  user_id: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

interface GroupMembersListProps {
  members: GroupMember[];
}

export function GroupMembersList({ members }: GroupMembersListProps) {
  return (
    <ul className="flex flex-col">
      {members.map((m) => {
        const name = m.profiles?.full_name ?? '—';
        const initials = (m.profiles?.full_name ?? '?').slice(0, 2).toUpperCase();
        return (
          <li key={m.user_id} className="flex items-center gap-3 py-2">
            <Avatar className="size-10">
              <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Link href={`/app/profile/${m.user_id}`} className="min-w-0 flex-1 truncate font-medium">
              {name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
