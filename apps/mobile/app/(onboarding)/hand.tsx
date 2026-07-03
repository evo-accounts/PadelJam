import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ChoiceRow, OnboardingStep } from '@/components/OnboardingStep';

export default function HandStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [hand, setHand] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/side');

  const onContinue = async () => {
    if (update.isPending) return;
    if (hand) {
      try {
        await update.mutateAsync({ dominant_hand: hand });
      } catch {
        /* re-promptable on relaunch; don't hard-block onboarding */
      }
    }
    goNext();
  };

  return (
    <OnboardingStep
      title={t('handTitle')}
      body={t('handBody')}
      primaryLabel={t('continue')}
      primaryDisabled={!hand || update.isPending}
      onPrimary={onContinue}
      onBack={() => router.back()}
      onSkip={goNext}
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
