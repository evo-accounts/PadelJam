import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { OnboardingStep } from '@/components/OnboardingStep';
import { supabase } from '@/lib/supabase';

export default function JammerPlusStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Final step: mark onboarding complete and land in the post-auth home.
  // (The full Jammer+ purchase flow is a later task.)
  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ onboarded_at: new Date().toISOString() })
          .eq('id', user.id);
      }
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingStep
      title={t('jammerPlusTitle')}
      body={t('jammerPlusBody')}
      primaryLabel={t('finish')}
      onPrimary={finish}
      onSkip={finish}
      primaryDisabled={busy}
    />
  );
}
