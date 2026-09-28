import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { markOnboarded } from '@/lib/onboardingStamps';
import { supabase } from '@/lib/supabase';
import { JammerPlusPaywall } from '../../components/profile/JammerPlusPaywall';

export default function JammerPlusStep() {
  const router = useRouter();
  // A ref, not state: this guard only needs to block a second tap mid-flight (✕ and
  // "Continue with Free" both call `finish`), not to re-render anything — it existed
  // before JammerPlusPaywall's extraction and was dropped along the way.
  const busy = useRef(false);

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Stamped server-side (migration 0120): clients no longer write this column.
      if (user) await markOnboarded(supabase, user.id);
      router.replace('/(tabs)');
    } finally {
      busy.current = false;
    }
  };

  return <JammerPlusPaywall mode="onboarding" onDone={finish} />;
}
