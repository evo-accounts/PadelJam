import { PLANS_VISIBLE } from '@padel/features';
import { useT } from '@padel/i18n';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { onStampFailure, stampNotificationsStep } from '@/lib/onboardingStamps';
import { registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useBanner } from '../../components/ui';

const TURTLE = require('../../assets/onboarding/turtle.png');
const DOVE = require('../../assets/onboarding/dove.png');
const CLOUD_A = require('../../assets/onboarding/cloud-a.png');
const CLOUD_B = require('../../assets/onboarding/cloud-b.png');

/** Frame 9: the turtle reaching for the dove, with a cloud behind each side. Decorative. */
function NotificationsArt() {
  return (
    <View style={art.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={CLOUD_A} style={art.cloudA} resizeMode="contain" />
      <Image source={CLOUD_B} style={art.cloudB} resizeMode="contain" />
      <Image source={DOVE} style={art.dove} resizeMode="contain" />
      {/* Last, so the raised hand's fingers stay visible under the dove. */}
      <Image source={TURTLE} style={art.turtle} resizeMode="contain" />
    </View>
  );
}

const art = StyleSheet.create({
  box: { width: '100%', maxWidth: 360, height: 330 },
  cloudA: { position: 'absolute', left: -24, top: 60, width: 119, height: 58 },
  cloudB: { position: 'absolute', right: -30, top: 10, width: 188, height: 93 },
  turtle: { position: 'absolute', left: 30, bottom: 0, width: 220, height: 240 },
  dove: { position: 'absolute', right: -20, top: 0, width: 156, height: 132 },
});

export default function NotificationsStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const banner = useBanner();
  const [busy, setBusy] = useState(false);

  const failures = useRef(0);

  // Records that the step was PUT to the user, for both Enable and Skip, so onboardingRoute() can
  // resume past it (and, with plans hidden, that onboarding is done). Stamped server-side (migration 0120) with one retry; a failure is surfaced
  // rather than navigated past silently, but never strands anyone — see onStampFailure.
  const goNext = async () => {
    if (await stampNotificationsStep(supabase)) {
      failures.current = 0;
    } else {
      failures.current += 1;
      if (onStampFailure(failures.current) === 'stay') {
        banner.show(t('onboardingSaveFailed'));
        return;
      }
      banner.show(t('onboardingSaveFailedContinue'));
    }
    if (PLANS_VISIBLE) router.push('/(onboarding)/jammer-plus');
    else router.replace('/(tabs)');
  };

  const onEnable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Notifications.requestPermissionsAsync();
      // registerForPush no longer prompts (see lib/push.ts), so the token has to
      // be registered here, right after the one place the app is allowed to ask.
      await registerForPush();
    } catch {
      // best-effort; proceed regardless of outcome
    } finally {
      setBusy(false);
    }
    await goNext();
  };

  return (
    <OnboardingStep
      header="intro"
      art={<NotificationsArt />}
      title={t('notificationsTitle')}
      body={t('notificationsBody')}
      primaryLabel={t('notificationsEnable')}
      primaryDisabled={busy}
      onPrimary={onEnable}
      secondaryLabel={t('notificationsSkip')}
      onSecondary={() => void goNext()}
    />
  );
}
