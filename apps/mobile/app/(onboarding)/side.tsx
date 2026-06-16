import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function SideStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [side, setSide] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/jammer-plus');

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
      title={t('sideTitle')}
      body={t('sideBody')}
      primaryLabel={t('continue')}
      primaryDisabled={update.isPending}
      onPrimary={onContinue}
      onSkip={goNext}
    >
      <ChoiceRow
        value={side}
        onChange={setSide}
        options={[
          { key: 'left', label: t('sideLeft') },
          { key: 'right', label: t('sideRight') },
        ]}
      />
    </OnboardingStep>
  );
}
