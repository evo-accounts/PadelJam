'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { CreateEventMenu } from '@/components/home/CreateEventMenu';
import { Button } from '@/components/ui/button';

/**
 * "Create event" in Explore's Events empty state (D10): the create-event control Home's quick
 * action uses, dressed as the empty state's button — straight to the wizard with one community to
 * create in, a picker with several, a pointer to communities with none.
 */
export function CreateEventAction({ testId }: { testId: string }) {
  const { t } = useT('explore');
  const label = t('createEventCta');
  return (
    <CreateEventMenu
      testId={testId}
      trigger={
        <Button variant="secondary" size="sm" data-testid={testId}>
          {label}
        </Button>
      }
      renderLink={(href) => (
        <Button asChild variant="secondary" size="sm">
          <Link href={href} data-testid={testId}>
            {label}
          </Link>
        </Button>
      )}
    />
  );
}
