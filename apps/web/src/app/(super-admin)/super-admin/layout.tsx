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
  const { data: isAdmin, isError } = useIsSuperAdmin();

  if (isAdmin === false || isError) notFound();

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
        {isAdmin === true ? children : <Skeleton className="m-6 h-40" data-testid="super-admin-checking" />}
      </main>
      <Toaster />
    </div>
  );
}
