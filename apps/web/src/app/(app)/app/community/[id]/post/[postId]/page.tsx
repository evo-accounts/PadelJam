'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { usePost, useComments, useAddComment } from '@padel/api';
import { PostCard } from '@/components/community/PostCard';
import { CommentList } from '@/components/community/CommentList';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

export default function PostDetailPage() {
  const { t } = useT('community');
  const { id, postId } = useParams<{ id: string; postId: string }>();
  const post = usePost(postId);
  const comments = useComments(postId);
  const add = useAddComment();
  const [body, setBody] = useState('');

  if (post.isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!post.data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-4 text-sm text-muted-foreground">
        {t('notAvailable')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <PostCard post={post.data} communityId={id} />

      <section className="flex flex-col gap-3">
        <CommentList comments={comments.data ?? []} />

        <div className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('commentPlaceholder')}
          />
          <Button
            type="button"
            className="self-end"
            disabled={add.isPending || !body.trim()}
            onClick={() =>
              add.mutate(
                { postId, communityId: id, body },
                { onSuccess: () => setBody('') },
              )
            }
          >
            {t('send')}
          </Button>
        </div>
      </section>
    </div>
  );
}
