import { useT } from '@padel/i18n';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';
import { markNotificationsPrompted } from '@/lib/onboardingStamps';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export default function NotificationsStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Records that the step was PUT to the user, for both Enable and Skip, so
  // onboardingRoute() can resume past it. Best-effort: failing to write this
  // must not strand someone in onboarding — the worst case is being asked once
  // more on the next launch.
  const markPrompted = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      // Stamped server-side (migration 0120): clients no longer write this column.
      if (data.user) await markNotificationsPrompted(supabase, data.user.id);
    } catch {
      /* best-effort */
    }
  };

  const goNext = async () => {
    await markPrompted();
    router.push('/(onboarding)/jammer-plus');
  };

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Notifications.requestPermissionsAsync();
      // registerForPush no longer prompts (see lib/push.ts), so the token has to
      // be registered here, right after the one place the app is allowed to ask.
      await registerForPush();
    } catch {
      // best-effort; proceed regardless of outcome
    } finally {
      setBusy(false);
    }
    await goNext();
  };

  return (
    <OnboardingStep
      title={t('notificationsTitle')}
      body={t('notificationsBody')}
      primaryLabel={t('notificationsEnable')}
      primaryDisabled={busy}
      onPrimary={onEnable}
      onBack={() => router.back()}
      onSkip={() => void goNext()}
    />
  );
}
