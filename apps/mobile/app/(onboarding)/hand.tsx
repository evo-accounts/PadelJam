import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { OptionList } from '@/components/onboarding/OptionList';

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
      header="question"
      step="hand"
      title={t('handTitle')}
      body={t('handBody')}
      primaryLabel={t('continue')}
      primaryDisabled={!hand || update.isPending}
      onPrimary={onContinue}
      onBack={() => router.back()}
    >
      <OptionList
        value={hand}
        onChange={setHand}
        options={[
          { value: 'left', title: t('handLeft') },
          { value: 'right', title: t('handRight') },
        ]}
        testID="hand-options"
      />
    </OnboardingStep>
  );
}
