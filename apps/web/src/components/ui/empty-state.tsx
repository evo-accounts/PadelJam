import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The standard empty state (UX-GLOB-03) on web: a muted icon, a title, an optional line, and an
 * optional action that leads out of the empty condition. The same dashed box the event and group
 * screens already draw inline, as one primitive for Home (UX-HOME-01) and Explore to share.
 *
 * `action` is the common case, a link. An action that is not a plain link — Explore's "Create
 * event", which may open a community picker (D10) — goes in `children` instead.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  testId,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; href: string; testId?: string };
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center"
      data-testid={testId}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground" aria-hidden /> : null}
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button asChild variant="secondary" size="sm" className="mt-1">
          <Link href={action.href} data-testid={action.testId}>
            {action.label}
          </Link>
        </Button>
      ) : null}
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}
