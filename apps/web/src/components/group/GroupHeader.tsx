'use client';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { GroupThumb } from './GroupThumb';

/**
 * The compact, messaging-style group header (UX-GRP-02/04): back, small thumbnail, name and the
 * description as a subtitle, with the viewer's menu on the right. Replaces the old large identity
 * block, whose member count duplicated the avatars line below it.
 */
export function GroupHeader({
  name,
  description,
  thumbnailPath,
  fallbackHref,
  actions,
}: {
  name: string;
  description?: string | null;
  thumbnailPath?: string | null;
  /** Where back goes when there is no history to return to (a pasted link). */
  fallbackHref: string;
  actions?: ReactNode;
}) {
  const { t } = useT('group');
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3">
      <BackButton fallbackHref={fallbackHref} label={t('back')} />
      <GroupThumb path={thumbnailPath} name={name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-lg font-semibold leading-tight">{name}</h1>
        {description ? <p className="truncate text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** A plain page title with back, for the group's sub-pages (Events, Ranking, Members…). */
export function GroupPageTitle({
  title,
  fallbackHref,
  subtitle,
  actions,
}: {
  title: string;
  fallbackHref: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const { t } = useT('group');
  return (
    <div className="flex items-center gap-3">
      <BackButton fallbackHref={fallbackHref} label={t('back')} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function BackButton({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="tertiary"
      size="icon"
      aria-label={label}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallbackHref))}
    >
      <ChevronLeft />
    </Button>
  );
}
