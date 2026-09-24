'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { commentSchema, usePost, useComments, useAddComment } from '@padel/api';
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
  const [failed, setFailed] = useState(false);

  // Send stays DISABLED on an empty comment, unlike the forms that validate on tap. That is
  // deliberate and matches mobile: this is a chat-style composer, whose Send has nothing to say
  // about an empty box, and UX-GLOB-06's list of forms does not include comments. What it lacked
  // was everything else mobile's composer does — the same schema (trimmed, at most 2000), and a
  // word when the send fails. It had no onError, so a failed comment re-enabled the button and sat
  // there looking sent.
  const onSend = () => {
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) return;
    setFailed(false);
    add.mutate(
      { postId, communityId: id, body: parsed.data.body },
      { onSuccess: () => setBody(''), onError: () => setFailed(true) },
    );
  };

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
            maxLength={2000}
          />
          {failed ? (
            <p role="alert" className="text-sm text-destructive">
              {t('postError')}
            </p>
          ) : null}
          <Button
            type="button"
            className="self-end"
            disabled={add.isPending || !body.trim()}
            onClick={onSend}
          >
            {t('send')}
          </Button>
        </div>
      </section>
    </div>
  );
}
