'use client';
/**
 * Privacy (UX-SET-05), the web half of the mobile screen.
 *
 * Two rows that had no home. Change password sat in the Account card beside the email and the
 * account deletion, and blocked-user management did not exist on web at all.
 */
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const rowClass =
  'flex items-center justify-between px-6 py-3 text-sm hover:bg-accent/50 transition-colors';

export default function PrivacyPage() {
  const { t } = useT('settings');

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('privacySettings')}</h1>

      <Card className="gap-0 py-0">
        <CardContent className="px-0 py-2">
          <Link href="/app/settings/password" className={rowClass}>
            <span>
              <span className="block">{t('changePassword')}</span>
              <span className="block text-muted-foreground">{t('privacyPasswordDescription')}</span>
            </span>
            <span aria-hidden className="text-muted-foreground">›</span>
          </Link>
          <Separator />
          <Link href="/app/settings/blocked" className={rowClass}>
            <span>
              <span className="block">{t('blockedTitle')}</span>
              <span className="block text-muted-foreground">{t('blockedDescription')}</span>
            </span>
            <span aria-hidden className="text-muted-foreground">›</span>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
