'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useT } from '@padel/i18n';
import { signOut, type TypedClient } from '@padel/auth';
import { useUpdateProfile } from '@padel/api';
import { supabase } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const rowClass =
  'flex items-center justify-between px-6 py-3 text-sm hover:bg-accent/50 transition-colors';

export default function SettingsPage() {
  const { t } = useT('settings');
  const router = useRouter();
  const { i18n } = useTranslation();
  const update = useUpdateProfile();

  const onLanguageChange = async (value: string) => {
    await update.mutateAsync({ locale: value });
    await i18n.changeLanguage(value);
  };

  const onLogout = async () => {
    await signOut(supabase as unknown as TypedClient);
    router.replace('/auth');
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {/* Account */}
      <Card className="gap-0 py-0">
        <CardHeader className="pt-6">
          <CardTitle>{t('account')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {/* Provisional placement. UX-SET-01 regroups this whole page into five cards in a later
              PR; these two rows exist NOW because UX-PROF-06 removed the Edit button from the
              profile, and without them there would be no route to editing your own details. */}
          <Link href="/app/settings/account" className={rowClass}>
            <span>{t('accountSettings')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <Link href="/app/settings/game" className={rowClass}>
            <span>{t('gamePreferences')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <Link href="/app/settings/email" className={rowClass}>
            <span>{t('changeEmail')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <Link href="/app/settings/password" className={rowClass}>
            <span>{t('changePassword')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card className="gap-0 py-0">
        <CardHeader className="pt-6">
          <CardTitle>{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Link href="/app/settings/notifications" className={rowClass}>
            <span>{t('notifications')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <div className={rowClass}>
            <span>{t('language')}</span>
            <Select value={i18n.language} onValueChange={onLanguageChange}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pt-PT">Português (PT)</SelectItem>
                <SelectItem value="pt-BR">Português (BR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          {/* Appearance sits with language: both are how the app presents
              itself, and neither touches account data. */}
          <div className={rowClass}>
            <span>{t('appearance')}</span>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* Support */}
      <Card className="gap-0 py-0">
        <CardHeader className="pt-6">
          <CardTitle>{t('support')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <Link href="/app/settings/support" className={rowClass}>
            <span>{t('contactSupport')}</span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <a
            href="https://padeljam.app/terms"
            target="_blank"
            rel="noreferrer"
            className={rowClass}
          >
            <span>{t('terms')}</span>
            <span aria-hidden className="text-muted-foreground">
              ↗
            </span>
          </a>
          <Separator />
          <a
            href="https://padeljam.app/privacy"
            target="_blank"
            rel="noreferrer"
            className={rowClass}
          >
            <span>{t('privacy')}</span>
            <span aria-hidden className="text-muted-foreground">
              ↗
            </span>
          </a>
        </CardContent>
      </Card>

      {/* Account actions */}
      <Card className="gap-0 py-0">
        <CardContent className="space-y-3 py-6">
          <Button variant="destructive" className="w-full" onClick={onLogout}>
            {t('logout')}
          </Button>
          <Link
            href="/app/settings/delete"
            className="block text-center text-sm text-destructive hover:underline"
          >
            {t('deleteAccount')}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
