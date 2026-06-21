'use client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';
import { StarRating } from './StarRating';

export interface Review {
  rating: number;
  body: string | null;
  created_at: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export function ReviewCard({ review }: { review: Review }) {
  const name = review.profiles?.full_name ?? '—';
  const initials = (review.profiles?.full_name ?? '?').slice(0, 2).toUpperCase();
  const date = new Date(review.created_at).toLocaleDateString();

  return (
    <div className="flex flex-col gap-2 py-3">
      <StarRating value={review.rating} />
      {review.body ? <p className="whitespace-pre-wrap text-sm">{review.body}</p> : null}
      <div className="flex items-center gap-2">
        <Avatar className="size-6">
          <AvatarImage src={avatarUrl(review.profiles?.avatar_url) ?? undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="text-xs text-muted-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{date}</span>
      </div>
    </div>
  );
}
