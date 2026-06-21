'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
}

export function CommentList({ comments }: { comments: Comment[] }) {
  return (
    <ul className="flex flex-col">
      {comments.map((c) => {
        const name = c.author?.full_name ?? '—';
        const initials = (c.author?.full_name ?? '?').slice(0, 2).toUpperCase();
        const date = new Date(c.created_at).toLocaleDateString();
        return (
          <li key={c.id} className="flex items-start gap-3 py-2">
            <Avatar className="size-8">
              <AvatarImage src={avatarUrl(c.author?.avatar_url) ?? undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
