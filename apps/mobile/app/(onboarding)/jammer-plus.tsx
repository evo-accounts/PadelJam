import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { JammerPlusPaywall } from '../../components/profile/JammerPlusPaywall';

export default function JammerPlusStep() {
  const router = useRouter();

  const finish = async () => {
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
  };

  return <JammerPlusPaywall mode="onboarding" onDone={finish} />;
}
