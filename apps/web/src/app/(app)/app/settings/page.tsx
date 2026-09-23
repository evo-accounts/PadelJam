'use client';
/**
 * Settings (UX-SET-01), the web half.
 *
 * Four groups, not mobile's five: the Subscription group is omitted. Nothing under `apps/web`
 * references the plan hooks, there is no web paywall, and Manage Community's Plan section is the
 * only place a plan can actually be changed — so a Subscription card here would be two rows that
 * lead nowhere web can serve.
 *
 * Every destination already exists; this regroups rows and removes two duplicates. Change email
 * and Delete account both moved into Account settings, which has held them since PR 9 — the hub
 * was offering a second route to each.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { signOut, type TypedClient } from '@padel/auth';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const rowClass =
  'flex items-center justify-between px-6 py-3 text-sm hover:bg-accent/50 transition-colors';

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={rowClass}>
      <span>{label}</span>
      <span aria-hidden className="text-muted-foreground">
        ›
      </span>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="pt-6">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">{children}</CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useT('settings');
  const router = useRouter();

  const onLogout = async () => {
    await signOut(supabase as unknown as TypedClient);
    router.replace('/auth');
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <Group title={t('account')}>
        <Row href="/app/settings/account" label={t('accountSettings')} />
        <Separator />
        <Row href="/app/settings/game" label={t('gamePreferences')} />
        <Separator />
        <Row href="/app/settings/privacy" label={t('privacySettings')} />
      </Group>

      <Group title={t('notifications')}>
        <Row href="/app/settings/notifications" label={t('notifications')} />
      </Group>

      <Group title={t('support')}>
        {/* The screens' own names, not the heading's word — a "Support" row directly under a
            "Support" heading reads like a mistake. */}
        <Row href="/app/settings/support" label={t('supportAndFeedback')} />
        <Separator />
        <Row href="/app/settings/app-preferences" label={t('appPreferences')} />
      </Group>

      <Group title={t('legal')}>
        <Row href="/app/settings/legal" label={t('legal')} />
      </Group>

      {/*
        Footer: Logout alone, full-width, in a card with NO heading.

        The heading is omitted to match mobile, where it is load-bearing rather than cosmetic:
        `e2e/driver/flows.ts` taps `{ text: /log out/i }` with no type filter, so a StaticText
        heading matching that text would shadow the button across seven suites. Web has no such
        suite — but two hubs reading differently for a reason that no longer applies is how they
        drift apart.

        Delete account moved into Account settings, with the rest of the account-destroying
        operations rather than loose under the logout.
      */}
      <Card className="gap-0 py-0">
        <CardContent className="py-6">
          <Button variant="destructive" className="w-full" onClick={onLogout}>
            {t('logout')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
