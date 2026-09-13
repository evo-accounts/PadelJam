/**
 * Welcome — three slides and one call to action (UX-AUTH-01).
 *
 * WHY THE COPY BLOCK HAS A FIXED HEIGHT. The audit's complaint is that the
 * artwork jumps between slides: "Meet your community" wraps to two lines in
 * pt-PT while "Play more" does not, and a text block that sizes itself pushes
 * the image up or down by a whole line as you swipe. Reserving two lines of
 * title and two of body — taken from the type scale, not measured by eye — puts
 * the illustration at the same place on every slide, in every locale.
 *
 * The art block is a fixed height for the same reason, and because a `flex: 1`
 * would not do what it looks like it does here: the pager is a horizontal
 * ScrollView, which sizes itself to its CONTENT, so there is no free space for a
 * flexing child to claim. The whole block is centred in what is left above the
 * button instead, which is what makes it adapt to the device.
 *
 * No TopBar: this is the first screen after the splash and there is nothing to
 * go back to. No consent line either — it moved to sign-in, where the sign-in
 * methods it refers to actually are (UX-AUTH-02).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space, type } from '../../theme';
import { Button, Carousel, Illustration, Screen, Text, type IllustrationName } from '../../components/ui';

type Slide = { art: IllustrationName; title: string; body: string };

/** Two lines of title, the gap under it, two lines of body. */
const COPY_HEIGHT = type.title.lineHeight * 2 + space[2] + type.body.lineHeight * 2;
/** Inside `Illustration`'s hero range (180–320), so the art fills it exactly. */
const ART_HEIGHT = 240;

export default function WelcomeScreen() {
  const { t } = useT('auth');
  const router = useRouter();

  const slides: Slide[] = [
    { art: 'welcomeFind', title: t('welcomeTitle1'), body: t('welcomeBody1') },
    { art: 'welcomeCommunity', title: t('welcomeTitle2'), body: t('welcomeBody2') },
    { art: 'welcomePlay', title: t('welcomeTitle3'), body: t('welcomeBody3') },
  ];

  const start = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    router.replace('/(auth)/sign-in');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Screen style={styles.body}>
        <Carousel
          data={slides}
          testID="welcome-carousel"
          renderItem={(slide) => (
            <View style={styles.slide}>
              {/* Decorative: the title under it already says what it shows. */}
              <Illustration name={slide.art} style={styles.art} />
              <View style={styles.copy}>
                <Text variant="title" numberOfLines={2} style={styles.title}>
                  {slide.title}
                </Text>
                <Text variant="body" tone="muted" numberOfLines={2} style={styles.text}>
                  {slide.body}
                </Text>
              </View>
            </View>
          )}
        />
      </Screen>

      <View style={styles.footer}>
        <Button label={t('startNow')} fullWidth onPress={start} testID="welcome-start" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { justifyContent: 'center' },
  slide: { alignItems: 'stretch' },
  art: { height: ART_HEIGHT },
  copy: { height: COPY_HEIGHT, marginTop: space[6] },
  title: { textAlign: 'center', marginBottom: space[2] },
  text: { textAlign: 'center' },
  footer: { paddingHorizontal: space[5], paddingTop: space[4] },
});
