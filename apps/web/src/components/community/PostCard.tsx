'use client';
import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { useT } from '@padel/i18n';
import { useToggleLike } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { avatarUrl } from '@/lib/upload';
import { PostImage } from './PostImage';

export interface Post {
  id: string;
  community_id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null } | null;
  likes: { count: number }[];
  comments: { count: number }[];
  mine: { user_id: string }[];
}

export function PostCard({ post, communityId }: { post: Post; communityId: string }) {
  const { t } = useT('community');
  const like = useToggleLike(communityId);

  const likedByMe = (post.mine?.length ?? 0) > 0;
  const likeCount = post.likes?.[0]?.count ?? 0;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const name = post.author?.full_name ?? '—';
  const initials = (post.author?.full_name ?? '?').slice(0, 2).toUpperCase();
  const date = new Date(post.created_at).toLocaleDateString();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <Avatar className="size-10">
          <AvatarImage src={avatarUrl(post.author?.avatar_url) ?? undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {post.body ? <p className="whitespace-pre-wrap">{post.body}</p> : null}
        {post.image_path ? <PostImage path={post.image_path} /> : null}
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => like.mutate({ postId: post.id, liked: likedByMe })}
        >
          <Heart className={likedByMe ? 'fill-red-500 text-red-500' : ''} />
          {likeCount}
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/app/community/${communityId}/post/${post.id}`}>
            <MessageCircle />
            {commentCount} {t('comments')}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
