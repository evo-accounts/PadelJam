import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { markOnboarded, onStampFailure, stampWithRetry } from '@/lib/onboardingStamps';
import { supabase } from '@/lib/supabase';
import { JammerPlusPaywall } from '../../components/profile/JammerPlusPaywall';
import { useBanner } from '../../components/ui';

export default function JammerPlusStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const banner = useBanner();
  // A ref, not state: this guard only needs to block a second tap mid-flight (✕ and
  // "Continue with Free" both call `finish`), not to re-render anything — it existed
  // before JammerPlusPaywall's extraction and was dropped along the way.
  const busy = useRef(false);
  const failures = useRef(0);

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Stamped server-side (migration 0120). Without onboarded_at the user is routed back into
      // onboarding on every launch, so a failure is surfaced rather than navigated past silently.
      if (await stampWithRetry(supabase, markOnboarded)) {
        failures.current = 0;
      } else {
        failures.current += 1;
        if (onStampFailure(failures.current) === 'stay') {
          banner.show(t('onboardingSaveFailed'));
          return;
        }
        banner.show(t('onboardingSaveFailedContinue'));
      }
      router.replace('/(tabs)');
    } finally {
      busy.current = false;
    }
  };

  return <JammerPlusPaywall mode="onboarding" onDone={finish} />;
}
