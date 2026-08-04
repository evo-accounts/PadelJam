import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

type Coords = { lat: number; lng: number };

/** Uses no component state, so it lives outside the component — and being a
  * declaration rather than a const means the debounced effect below can call
  * it regardless of source order. */
function formatAddress(p: Location.LocationGeocodedAddress | undefined): string {
  if (!p) return '';
  const parts = [p.name, p.city ?? p.subregion, p.region].filter(Boolean) as string[];
  return [...new Set(parts)].join(', ');
}

type Mode = 'pick' | 'manual';

export default function LocationStep() {
  const { t } = useT('onboarding');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('pick');
  const [text, setText] = useState('');
  const [resolved, setResolved] = useState<(Coords & { label: string }) | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const goNext = () => router.push('/(onboarding)/hand');

  // Resolve what was typed into an actual place, debounced. expo-location's
  // geocodeAsync returns coordinates only, so the name shown back to the user
  // comes from reverse-geocoding the hit — that round trip is what makes the
  // confirmation trustworthy rather than just echoing their typing.
  //
  // A true autocomplete would need a places API and a new dependency; this gets
  // the same guarantee (Continue means a real place) with what is already here.
  useEffect(() => {
    const q = text.trim();
    setResolved(null);
    if (q.length < 3) {
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const hits = await Location.geocodeAsync(q);
        const hit = hits[0];
        if (!hit) return;
        const places = await Location.reverseGeocodeAsync({
          latitude: hit.latitude,
          longitude: hit.longitude,
        });
        if (cancelled) return;
        setResolved({
          lat: hit.latitude,
          lng: hit.longitude,
          label: formatAddress(places[0]) || q,
        });
      } catch {
        /* leave unresolved; Continue stays disabled */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [text]);


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
