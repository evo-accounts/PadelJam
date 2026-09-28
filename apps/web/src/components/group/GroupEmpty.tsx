'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** The group screens' empty state: a title, an optional line, an optional action. */
export function GroupEmpty({
  title,
  body,
  action,
  testId,
}: {
  title: string;
  body?: string;
  action?: { label: string; href: string };
  testId?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center" data-testid={testId}>
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
      {action ? (
        <Button asChild variant="secondary" size="sm" className="mt-1">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
