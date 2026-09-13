/**
 * Password recovery, step 3 of 3: the confirmation (UX-AUTH-09).
 *
 * "This is the only path out of this screen — it does not continue into a
 * signed-in session." So this screen reads NOTHING: no session, no profile, no
 * branching. The session was already torn down on new-password.tsx the instant
 * the update succeeded, and the one button here is a plain replace to sign-in.
 *
 * That also means there is nothing to go back to: the header carries no back
 * and no actions, and the route is registered with `gestureEnabled: false` in
 * `_layout.tsx` so the screen cannot be swiped out of either.
 */
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '../../theme';
import { Button, Illustration, Screen, Text, TopBar } from '../../components/ui';

export default function PasswordChangedScreen() {
  const { t } = useT('auth');
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar variant="top" />
      <Screen style={styles.body}>
        <Illustration name="passwordChanged" size="hero" />
        <Text variant="title" style={styles.centred}>
          {t('recoveryDoneTitle')}
        </Text>
        <Text variant="body" tone="muted" style={[styles.centred, styles.description]}>
          {t('recoveryDoneBody')}
        </Text>
        <Button
          label={t('recoveryDoneCta')}
          fullWidth
          onPress={() => router.replace('/(auth)/sign-in')}
          style={styles.cta}
          testID="password-changed-cta"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { paddingTop: space[6], paddingBottom: space[8], alignItems: 'center' },
  centred: { textAlign: 'center' },
  description: { marginTop: space[2] },
  cta: { marginTop: space[8] },
});
