import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { supabase } from '@/lib/supabase';

type Coords = { lat: number; lng: number };

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
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
      if (status !== 'granted') {
        setNotice(t('locationPermissionDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const next: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(next);
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: next.lat, longitude: next.lng });
        const addr = formatAddress(places[0]);
        if (addr) setText(addr);
      } catch {
        // reverse-geocode is best-effort; keep the coords even if it fails.
      }
    } catch {
      setNotice(t('locationPermissionDenied'));
    } finally {
      setLocating(false);
    }
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

  return (
    <OnboardingStep
      title={t('locationTitle')}
      body={t('locationBody')}
      primaryLabel={t('continue')}
      onPrimary={onContinue}
      onSkip={goNext}
      primaryDisabled={saving}>
      <Pressable
        style={styles.gpsButton}
        onPress={useCurrentLocation}
        disabled={locating}
        accessibilityRole="button">
        {locating ? (
          <ActivityIndicator color="#0B7BFF" />
        ) : (
          <Text style={styles.gpsButtonText}>{t('locationUseCurrent')}</Text>
        )}
      </Pressable>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(v) => {
          setText(v);
          setCoords(null);
        }}
        placeholder={t('locationManualPlaceholder')}
        autoCapitalize="words"
      />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  gpsButton: {
    borderWidth: 1,
    borderColor: '#0B7BFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  gpsButtonText: { color: '#0B7BFF', fontSize: 16, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  notice: { marginTop: 10, color: '#6B7685', fontSize: 13 },
});
