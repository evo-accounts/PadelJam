'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCommunityReviews, useCanReviewCommunity } from '@padel/api';
import { ReviewCard } from '@/components/community/ReviewCard';
import { StarRating } from '@/components/community/StarRating';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function CommunityReviewsPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const reviews = useCommunityReviews(id);
  const canReview = useCanReviewCommunity(id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <StarRating value={Math.round(reviews.data?.average ?? 0)} />
          <span className="text-sm text-muted-foreground">
            {t('reviewsCount', { count: reviews.data?.count ?? 0 })}
          </span>
        </div>
        {canReview.data === true ? (
          <Button asChild>
            <Link href={`/app/community/${id}/reviews/write`}>{t('writeReview')}</Link>
          </Button>
        ) : null}
      </div>

      {reviews.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (reviews.data?.reviews.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noReviews')}</p>
      ) : (
        <div className="flex flex-col divide-y">
          {reviews.data!.reviews.map((r, i) => (
            <ReviewCard key={i} review={r} />
          ))}
        </div>
      )}
    </div>
  );
}
