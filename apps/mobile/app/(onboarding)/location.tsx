import { useSetMyLocation } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/OnboardingStep';
import { formatAddress, useGeocodeSearch } from '@/lib/useGeocodeSearch';
import { colors } from '../../theme';

type Coords = { lat: number; lng: number };

type Mode = 'pick' | 'manual';

export default function LocationStep() {
  const { t } = useT('onboarding');
  const { t: tc } = useT('common');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('pick');
  const [text, setText] = useState('');
  // Same resolution Account Settings uses (UX-SET-02). It was lifted out of this file unchanged,
  // so that screen reuses what already works here instead of growing a second geocode path.
  const { resolved, searching, approximate } = useGeocodeSearch(text);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  // The last `set_my_location` call failed. supabase-js resolves an RPC error rather than
  // throwing it, so this used to be swallowed: the step advanced and onboarding finished with
  // no location saved. `useSetMyLocation` checks `{ error }` and throws, like every other writer.
  const [saveFailed, setSaveFailed] = useState(false);
  const setLocation = useSetMyLocation();

  const goNext = () => router.push('/(onboarding)/hand');

  /*
   * Best-effort stops at having a position. Denied permission, no fix, or a failed reverse
   * geocode all still advance — the user can type a place later, and nothing they chose is lost.
   * A failed SAVE is different: they asked for this location and got a fix, so advancing would
   * tell them it was stored when it was not. That keeps them on the step with the error, and
   * tapping the button again is the retry. (Reverse-geocoding is now its own try: its failure
   * used to skip the save too, discarding good coordinates over a missing label.)
   */
  const useCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    setSaveFailed(false);
    let fix: Coords | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // permission or position error: no fix, still advance
    }
    try {
      if (fix) {
        let label: string | null = null;
        try {
          const places = await Location.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lng });
          label = formatAddress(places[0]) || null;
        } catch {
          // no label; the coordinates are still worth saving
        }
        await setLocation.mutateAsync({ lat: fix.lat, lng: fix.lng, text: label });
      }
    } catch {
      setSaveFailed(true);
      return;
    } finally {
      setLocating(false);
    }
    goNext();
  };

  const onContinue = async () => {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      // `resolved` is non-null whenever this runs — Continue is disabled otherwise — and it is
      // either a real place or the typed text with null coordinates, which `set_my_location`
      // stores as text alone. Either way the lookup has already finished; nothing is retried here.
      if (resolved) {
        await setLocation.mutateAsync({ lat: resolved.lat, lng: resolved.lng, text: resolved.label });
      }
      goNext();
    } catch {
      // Stay on the step. Continue becomes Retry; Skip still leaves without a location.
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const saveError = saveFailed ? (
    <Text style={styles.error} accessibilityRole="alert" testID="location-save-error">
      {t('locationSaveFailed')}
    </Text>
  ) : null;

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
            onPress={() => {
              setSaveFailed(false);
              setMode('manual');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.pickSecondaryText}>{t('locationAddManually')}</Text>
          </Pressable>
        </View>
        {saveError}
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      title={t('locationManualTitle')}
      body={t('locationBody')}
      primaryLabel={saveFailed ? tc('retry') : t('continue')}
      // Gated on a FINISHED lookup, not on the field being non-empty. Typing
      // three characters used to enable Continue, which made it behave exactly
      // like Skip — the same defect UX-AUTH-02 flags on the hand/side steps.
      // The lookup always finishes now (see `useGeocodeSearch`), so this gate
      // can no longer strand anyone.
      primaryDisabled={!resolved || saving}
      onPrimary={onContinue}
      onBack={() => {
        setSaveFailed(false);
        setMode('pick');
      }}
      onSkip={goNext}
    >
      {/* No autoFocus. The keyboard opening uninvited is UX-AUTH-01's complaint;
          it now appears only when the user taps the field. */}
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setSaveFailed(false);
        }}
        placeholder={t('locationManualPlaceholder')}
        autoCapitalize="words"
      />
      {searching ? <Text style={styles.notice}>{t('locationSearching')}</Text> : null}
      {resolved ? <Text style={styles.resolved}>{resolved.label}</Text> : null}
      {approximate ? <Text style={styles.notice}>{t('locationGeocodeFailed')}</Text> : null}
      {saveError}
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
  error: { marginTop: 10, color: colors.destructive, fontSize: 13 },
});
