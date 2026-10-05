'use client';
/**
 * Error boundary for the signed-in app. Without it, an error thrown while rendering any /app page
 * left a blank screen (the old onboarding blank page was one). This keeps the shell and offers a
 * retry and a way home; the error itself is still logged to the console.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT('app');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col gap-4 p-6 py-16">
      <h1 className="text-2xl font-semibold">{t('errorPage.title')}</h1>
      <p className="text-muted-foreground">{t('errorPage.body')}</p>
      <div className="flex gap-2">
        <Button onClick={reset}>{t('errorPage.retry')}</Button>
        <Button variant="secondary" asChild>
          <Link href="/app">{t('errorPage.home')}</Link>
        </Button>
      </div>
    </div>
  );
}
