import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { CourtSidePicker, type CourtSide } from '@/components/onboarding/CourtSidePicker';

export default function SideStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [side, setSide] = useState<CourtSide | null>(null);

  const goNext = () => router.push('/(onboarding)/notifications');

  const onContinue = async () => {
    if (update.isPending) return;
    if (side) {
      try {
        await update.mutateAsync({ court_side: side });
      } catch {
        /* re-promptable on relaunch; don't hard-block onboarding */
      }
    }
    goNext();
  };

  return (
    <OnboardingStep
      header="question"
      step="side"
      title={t('sideTitle')}
      body={t('sideBody')}
      primaryLabel={t('continue')}
      primaryDisabled={!side || update.isPending}
      onPrimary={onContinue}
      onBack={() => router.back()}
    >
      <CourtSidePicker
        value={side}
        onChange={setSide}
        leftLabel={t('sideLeft')}
        rightLabel={t('sideRight')}
        switchLabel={t('switchSide')}
        testID="side-picker"
      />
    </OnboardingStep>
  );
}
