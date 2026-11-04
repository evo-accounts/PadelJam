import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { OptionList } from '@/components/onboarding/OptionList';

export default function SideStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [side, setSide] = useState<string | null>(null);

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
      <OptionList
        value={side}
        onChange={setSide}
        options={[
          { value: 'left', title: t('sideLeft') },
          { value: 'right', title: t('sideRight') },
        ]}
        testID="side-options"
      />
    </OnboardingStep>
  );
}
