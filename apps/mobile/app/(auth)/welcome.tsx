import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const { t } = useT('onboarding');
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

      <Pressable style={styles.button} onPress={start} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('startNow')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  body: { fontSize: 16, color: '#444', textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginVertical: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ccc', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#0B1F3A' },
  button: {
    marginHorizontal: 24,
    backgroundColor: '#0B1F3A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
