import { useT } from '@padel/i18n';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';

export default function NotificationsStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const goNext = () => router.push('/(onboarding)/jammer-plus');

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // best-effort; proceed regardless of outcome
    } finally {
      setBusy(false);
    }
    goNext();
  };

  return (
    <OnboardingStep
      title={t('notificationsTitle')}
      body={t('notificationsBody')}
      primaryLabel={t('notificationsEnable')}
      primaryDisabled={busy}
      onPrimary={onEnable}
      onBack={() => router.back()}
      onSkip={goNext}
    />
  );
}
