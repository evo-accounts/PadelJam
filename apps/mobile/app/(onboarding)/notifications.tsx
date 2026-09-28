import { useT } from '@padel/i18n';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';
import { markNotificationsPrompted, onStampFailure, stampWithRetry } from '@/lib/onboardingStamps';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useBanner } from '../../components/ui';

export default function NotificationsStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const banner = useBanner();
  const [busy, setBusy] = useState(false);

  const failures = useRef(0);

  // Records that the step was PUT to the user, for both Enable and Skip, so onboardingRoute() can
  // resume past it. Stamped server-side (migration 0120) with one retry; a failure is surfaced
  // rather than navigated past silently, but never strands anyone — see onStampFailure.
  const goNext = async () => {
    if (await stampWithRetry(supabase, markNotificationsPrompted)) {
      failures.current = 0;
    } else {
      failures.current += 1;
      if (onStampFailure(failures.current) === 'stay') {
        banner.show(t('onboardingSaveFailed'));
        return;
      }
      banner.show(t('onboardingSaveFailedContinue'));
    }
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
