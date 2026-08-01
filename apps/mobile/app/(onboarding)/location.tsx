import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

type Coords = { lat: number; lng: number };
type Mode = 'pick' | 'manual';

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('pick');
  const [text, setText] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/hand');

  const formatAddress = (p: Location.LocationGeocodedAddress | undefined): string => {
    if (!p) return '';
    const parts = [p.name, p.city ?? p.subregion, p.region].filter(Boolean) as string[];
    return [...new Set(parts)].join(', ');
  };

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
      let finalCoords = coords;
      const trimmed = text.trim();
      if (!finalCoords && trimmed) {
        try {
          const results = await Location.geocodeAsync(trimmed);
          if (results[0]) finalCoords = { lat: results[0].latitude, lng: results[0].longitude };
          else setNotice(t('locationGeocodeFailed'));
        } catch {
          setNotice(t('locationGeocodeFailed'));
        }
      }
      if (finalCoords || trimmed) {
        await supabase.rpc('set_my_location', {
          p_lat: finalCoords?.lat ?? null,
          p_lng: finalCoords?.lng ?? null,
          p_text: trimmed || null,
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
      primaryDisabled={!text.trim() || saving}
      onPrimary={onContinue}
      onBack={() => setMode('pick')}
      onSkip={goNext}
    >
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setCoords(null);
        }}
        placeholder={t('locationManualPlaceholder')}
        autoCapitalize="words"
        autoFocus
      />
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
});
