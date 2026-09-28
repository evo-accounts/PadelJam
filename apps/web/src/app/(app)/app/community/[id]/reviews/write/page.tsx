'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCanReviewCommunity, useUpsertReview } from '@padel/api';
import { StarRating } from '@/components/community/StarRating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function WriteReviewPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canReview = useCanReviewCommunity(id);
  const upsert = useUpsertReview(id);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');

  if (canReview.data === false) {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t('notAvailable')}</p>
        <Button asChild variant="secondary">
          <Link href={`/app/community/${id}/reviews`}>{t('reviews')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <StarRating value={rating} onChange={setRating} size={28} />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('reviewPlaceholder')}
      />
      <Button
        type="button"
        className="self-end"
        disabled={rating === 0 || upsert.isPending}
        onClick={() =>
          upsert.mutate(
            { rating, body: body || undefined },
            { onSuccess: () => router.push(`/app/community/${id}/reviews`) },
          )
        }
      >
        {t('submitReview')}
      </Button>
    </div>
  );
}
