import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function HandStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [hand, setHand] = useState<string | null>(null);

  const next = () => router.push('/(onboarding)/side');

  return (
    <OnboardingStep
      title={t('handTitle')}
      body={t('handBody')}
      primaryLabel={t('continue')}
      onPrimary={next}
      onSkip={next}
    >
      <ChoiceRow
        value={hand}
        onChange={setHand}
        options={[
          { key: 'left', label: t('handLeft') },
          { key: 'right', label: t('handRight') },
        ]}
      />
    </OnboardingStep>
  );
}
