import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [value, setValue] = useState('');

  const next = () => router.push('/(onboarding)/hand');

  return (
    <OnboardingStep
      title={t('locationTitle')}
      body={t('locationBody')}
      primaryLabel={t('continue')}
      onPrimary={next}
      onSkip={next}
    >
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder={t('locationTitle')}
        autoCapitalize="words"
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
});
