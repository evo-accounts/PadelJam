/**
 * Support and feedback (UX-SET-12).
 *
 * `/profile/support` used to BE the ticket form. It is now a hub of four rows, and the form moved
 * to `/profile/support/contact` — the rows are specified in `Requirements/profile.md` §6.3 and
 * acceptance criterion PR-11: Help center, Contact support, Rate the app, Share the app.
 *
 * Requirements §6.4 describes Contact support as a bottom sheet. It is a route here instead,
 * decided with the product owner: the form already exists as a full screen with field validation
 * and a dirty guard, and rebuilding it inside a sheet would be churn against working code for no
 * change the user can see. §6.3 is amended rather than silently overruled.
 *
 * RATE THE APP IS HIDDEN, not missing. There is no destination yet — the app is not on the store,
 * so there is no App Store ID and `STORE_URL` is empty. A row that opens nothing is worse than a
 * row that is not there, so it renders only once the constant is filled in. That is the whole of
 * switching it on; nothing else here changes.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Linking, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HELP_URL, STORE_URL } from '@/lib/externalUrls';
import { colors, space } from '../../../theme';
import { ListRow, Screen, TopBar } from '../../../components/ui';

const icon = (ios: string, android: string) => (
  <SymbolView
    name={{ ios, android, web: android } as never}
    size={22}
    tintColor={colors.foreground}
    accessibilityElementsHidden
    importantForAccessibility="no"
  />
);

export default function SupportHubScreen() {
  const { t } = useT('profile');
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('support')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        <ListRow
          variant="card"
          leading={icon('questionmark.circle', 'help')}
          title={t('helpCenter')}
          subtitle={t('helpCenterDescription')}
          onPress={() => void Linking.openURL(HELP_URL)}
          testID="support-help-row"
        />
        <ListRow
          variant="card"
          leading={icon('envelope', 'mail')}
          title={t('contactSupport')}
          subtitle={t('contactSupportDescription')}
          onPress={() => router.push('/profile/support/contact')}
          testID="support-contact-row"
        />
        {STORE_URL ? (
          <ListRow
            variant="card"
            leading={icon('star', 'star')}
            title={t('rateApp')}
            subtitle={t('rateAppDescription')}
            onPress={() => void Linking.openURL(STORE_URL)}
            testID="support-rate-row"
          />
        ) : null}
        <ListRow
          variant="card"
          leading={icon('square.and.arrow.up', 'share')}
          title={t('shareApp')}
          subtitle={t('shareAppDescription')}
          onPress={() => void Share.share({ message: t('shareMessage') })}
          testID="support-share-row"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[2] },
});
