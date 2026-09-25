'use client';
import { communityImageUrl } from '@/lib/community-images';
import { cn } from '@/lib/utils';

/** A group's (or community's) round thumbnail, falling back to its initial. */
export function GroupThumb({
  path,
  name,
  className,
}: {
  path: string | null | undefined;
  name: string;
  className?: string;
}) {
  const src = communityImageUrl(path, 'community-thumbnails');
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn('size-10 shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
    >
      {(name.charAt(0) || '?').toUpperCase()}
    </span>
  );
}
