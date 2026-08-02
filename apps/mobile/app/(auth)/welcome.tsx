import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Dimensions, Linking, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, palette } from '../../theme';
import { Button } from '../../components/ui';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const { t } = useT('auth');
  const [disclosureBefore, disclosureRest] = t('socialTermsDisclosure').split('{{termsLink}}');
  const [disclosureMiddle, disclosureAfter] = (disclosureRest ?? '').split('{{privacyLink}}');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);

  const cards = [
    { title: t('welcomeTitle1'), body: t('welcomeBody1') },
    { title: t('welcomeTitle2'), body: t('welcomeBody2') },
    { title: t('welcomeTitle3'), body: t('welcomeBody3') },
  ];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const TERMS_URL = 'https://padeljam.app/terms';
  const PRIVACY_URL = 'https://padeljam.app/privacy';

  const start = async () => {
    await AsyncStorage.setItem('hasSeenWelcome', 'true');
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {cards.map((card) => (
          <View key={card.title} style={[styles.card, { width }]}>
            <Text style={styles.title}>{card.title}</Text>
            <Text style={styles.body}>{card.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {cards.map((card, i) => (
          <View key={card.title} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <Button label={t('startNow')} fullWidth onPress={start} />
      <Text style={styles.disclosure}>
        {disclosureBefore}
        <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(TERMS_URL)}>
          {t('termsLink')}
        </Text>
        {disclosureMiddle}
        <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
          {t('privacyLink')}
        </Text>
        {disclosureAfter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  body: { fontSize: 16, color: colors.mutedForeground, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginVertical: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, marginHorizontal: 4 },
  dotActive: { backgroundColor: colors.primary },
  button: {
    marginHorizontal: 24,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  disclosure: { fontSize: 11, color: palette.slate[400], textAlign: 'center', marginTop: 12, marginHorizontal: 24, lineHeight: 16 },
  disclosureLink: { color: colors.primary, fontWeight: '600' },
});
