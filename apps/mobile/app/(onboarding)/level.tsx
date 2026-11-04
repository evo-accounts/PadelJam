import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { OptionList } from '@/components/onboarding/OptionList';

const BADGE_TARGET = require('../../assets/onboarding/badge-target@2x.png');

// Stored as profiles.level 1-4; the radio group deals in strings.
const BANDS = [
  { value: '1', title: 'levelBeginner', description: 'levelBeginnerDesc' },
  { value: '2', title: 'levelCasual', description: 'levelCasualDesc' },
  { value: '3', title: 'levelIntermediate', description: 'levelIntermediateDesc' },
  { value: '4', title: 'levelAdvanced', description: 'levelAdvancedDesc' },
] as const;

export default function LevelStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const update = useUpdateProfile();
  const [level, setLevel] = useState<string | null>(null);

  const onContinue = async () => {
    if (!level || update.isPending) return;
    try {
      await update.mutateAsync({ level: Number(level) });
    } catch {
      /* re-promptable on relaunch (level stays null); don't hard-block onboarding */
    }
    router.push('/(onboarding)/hand');
  };

  return (
    <OnboardingStep
      header="question"
      step="level"
      title={t('levelTitle')}
      body={t('levelBody')}
      primaryLabel={t('continue')}
      primaryDisabled={!level || update.isPending}
      onPrimary={onContinue}
      onBack={() => router.back()}
    >
      <OptionList
        value={level}
        onChange={setLevel}
        options={BANDS.map((b) => ({
          value: b.value,
          title: t(b.title),
          description: t(b.description),
          badge: BADGE_TARGET,
        }))}
        testID="level-options"
      />
    </OnboardingStep>
  );
}
