'use client';
/**
 * The platform super-admin area (UX events plan, decision 3). Signed-out visitors are sent to
 * /auth by the middleware; signed-in users who are not in `platform_admins` get a 404, so the
 * area does not advertise itself. The database enforces the same rule on every write (0114).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useIsSuperAdmin } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/toaster';

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { t } = useT('superAdmin');
  const { data: isAdmin, isError, refetch, isFetching } = useIsSuperAdmin();

  // Only a definite "no" is a 404; a failed check (network, 5xx) is not an answer.
  if (isAdmin === false) notFound();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
        <Link href="/super-admin" className="text-lg font-semibold">
          Padel Jam · {t('title')}
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/app">{t('backToApp')}</Link>
        </Button>
      </header>
      <main className="flex-1">
        {isAdmin === true ? (
          children
        ) : isError ? (
          <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-2 p-6">
            <p className="text-sm">{t('checkError')}</p>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : (
          <Skeleton className="m-6 h-40" data-testid="super-admin-checking" />
        )}
      </main>
      <Toaster />
    </div>
  );
}
