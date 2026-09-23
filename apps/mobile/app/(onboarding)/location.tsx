import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { formatAddress, useGeocodeSearch } from '@/lib/useGeocodeSearch';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

type Coords = { lat: number; lng: number };

type Mode = 'pick' | 'manual';

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('pick');
  const [text, setText] = useState('');
  // Same resolution Account Settings uses (UX-SET-02). It was lifted out of this file unchanged,
  // so that screen reuses what already works here instead of growing a second geocode path.
  const { resolved, searching } = useGeocodeSearch(text);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/hand');

  const useCurrentLocation = async () => {
    if (locating) return;
    setNotice(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        const next: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          const places = await Location.reverseGeocodeAsync({ latitude: next.lat, longitude: next.lng });
          const addr = formatAddress(places[0]);
          await supabase.rpc('set_my_location', {
            p_lat: next.lat,
            p_lng: next.lng,
            p_text: addr || null,
          });
        } catch {
          // reverse-geocode or save is best-effort; still advance
        }
      }
    } catch {
      // permission error: still advance regardless
    } finally {
      setLocating(false);
    }
    goNext();
  };

  const onContinue = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // `resolved` is non-null whenever this runs — Continue is disabled
      // otherwise — so there is no second geocode and no failure path here.
      if (resolved) {
        await supabase.rpc('set_my_location', {
          p_lat: resolved.lat,
          p_lng: resolved.lng,
          p_text: resolved.label,
        });
      }
      goNext();
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'pick') {
    return (
      <OnboardingStep
        title={t('locationTitle')}
        body={t('locationBody')}
        primaryLabel=""
        hidePrimary
        onPrimary={() => {}}
        onBack={() => router.back()}
        onSkip={goNext}
      >
        <View style={styles.pickButtons}>
          <Pressable
            style={[styles.pickPrimary, locating && styles.pickPrimaryDisabled]}
            onPress={useCurrentLocation}
            disabled={locating}
            accessibilityRole="button"
          >
            {locating ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.pickPrimaryText}>{t('locationUseCurrentTitle')}</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.pickSecondary}
            onPress={() => setMode('manual')}
            accessibilityRole="button"
          >
            <Text style={styles.pickSecondaryText}>{t('locationAddManually')}</Text>
          </Pressable>
        </View>
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      title={t('locationManualTitle')}
      body={t('locationBody')}
      primaryLabel={t('continue')}
      // Gated on a RESOLVED place, not on the field being non-empty. Typing
      // three characters used to enable Continue, which made it behave exactly
      // like Skip — the same defect UX-AUTH-02 flags on the hand/side steps.
      primaryDisabled={!resolved || saving}
      onPrimary={onContinue}
      onBack={() => setMode('pick')}
      onSkip={goNext}
    >
      {/* No autoFocus. The keyboard opening uninvited is UX-AUTH-01's complaint;
          it now appears only when the user taps the field. */}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={t('locationManualPlaceholder')}
        autoCapitalize="words"
      />
      {searching ? <Text style={styles.notice}>{t('locationSearching')}</Text> : null}
      {resolved ? <Text style={styles.resolved}>{resolved.label}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  pickButtons: {
    gap: 12,
  },
  pickPrimary: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pickPrimaryDisabled: {
    opacity: 0.6,
  },
  pickPrimaryText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  pickSecondary: {
    borderWidth: 1,
    borderColor: colors.foreground,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pickSecondaryText: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  notice: { marginTop: 10, color: colors.mutedForeground, fontSize: 13 },
  // The confirmed place reads as an answer, not as a hint.
  resolved: { marginTop: 10, color: colors.foreground, fontSize: 15, fontWeight: '600' },
});
