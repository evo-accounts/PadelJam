import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function SideStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [side, setSide] = useState<string | null>(null);

  const next = () => router.push('/(onboarding)/jammer-plus');

  return (
    <OnboardingStep
      title={t('sideTitle')}
      body={t('sideBody')}
      primaryLabel={t('continue')}
      onPrimary={next}
      onSkip={next}
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
