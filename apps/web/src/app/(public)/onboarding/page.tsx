'use client';
/**
 * "Finish setting up in the app" — where the middleware sends a signed-in user whose profile has
 * not finished onboarding. Web has no onboarding of its own (location, hand and side live in the
 * mobile app), so this page explains that and offers the two ways out: back to /app once they've
 * finished on the phone (the middleware re-checks), or sign out.
 */
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { signOut, type TypedClient } from '@padel/auth';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export default function FinishInAppPage() {
  const { t } = useT('app');
  const router = useRouter();

  const onSignOut = async () => {
    await signOut(supabase as unknown as TypedClient);
    router.replace('/auth');
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">{t('finishInApp.title')}</h1>
      <p className="text-muted-foreground">{t('finishInApp.body')}</p>
      <div className="mt-2 flex flex-col gap-2">
        <Button onClick={() => router.replace('/app')}>{t('finishInApp.done')}</Button>
        <Button variant="secondary" onClick={onSignOut}>
          {t('finishInApp.signOut')}
        </Button>
      </div>
    </main>
  );
}
