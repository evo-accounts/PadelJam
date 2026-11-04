import { useSetMyLocation } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/ui/native';

import { OnboardingStep } from '@/components/onboarding/OnboardingStep';
import { OptionCard } from '@/components/onboarding/OptionList';
import { IconButton } from '@/components/ui';
import { formatAddress, useGeocodeSearch } from '@/lib/useGeocodeSearch';
import { colors, onboardingColors, radius, space, type } from '../../theme';

const BADGE_PIN = require('../../assets/onboarding/badge-pin.png');
const BUNNY = require('../../assets/onboarding/bunny.png');
const CLOUD_A = require('../../assets/onboarding/cloud-a.png');
const CLOUD_B = require('../../assets/onboarding/cloud-b.png');

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
  const { places, searching, approximate } = useGeocodeSearch(text);
  // The card the user picked; the first is preselected, so Continue works as soon as a lookup ends.
  const [picked, setPicked] = useState(0);
  useEffect(() => setPicked(0), [places]);
  const resolved = places[picked] ?? null;
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  // The last `set_my_location` call failed. supabase-js resolves an RPC error rather than
  // throwing it, so this used to be swallowed: the step advanced and onboarding finished with
  // no location saved. `useSetMyLocation` checks `{ error }` and throws, like every other writer.
  const [saveFailed, setSaveFailed] = useState(false);
  const setLocation = useSetMyLocation();

  const goNext = () => router.push('/(onboarding)/level');

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
        header="intro"
        title={t('locationShareTitle')}
        body={t('locationShareBody')}
        primaryLabel={t('locationUseCurrentTitle')}
        primaryLoading={locating}
        onPrimary={useCurrentLocation}
        secondaryLabel={t('locationAddManually')}
        onSecondary={() => {
          setSaveFailed(false);
          setMode('manual');
        }}
        onSkip={goNext}
        art={
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={CLOUD_B} style={styles.cloudB} resizeMode="contain" />
            <Image source={CLOUD_A} style={styles.cloudA} resizeMode="contain" />
            <Image source={BUNNY} style={styles.bunny} resizeMode="contain" />
          </View>
        }
      >
        {saveError}
      </OnboardingStep>
    );
  }

  return (
    <OnboardingStep
      header="question"
      step="location"
      title={t('locationTitle')}
      body={t('locationManualBody')}
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
    >
      {/* No autoFocus. The keyboard opening uninvited is UX-AUTH-01's complaint;
          it now appears only when the user taps the field. */}
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(next) => {
            setText(next);
            setSaveFailed(false);
          }}
          placeholder={t('locationManualPlaceholder')}
          accessibilityLabel={t('locationManualPlaceholder')}
          autoCapitalize="words"
          testID="location-search"
        />
        {text ? (
          <IconButton
            icon="✕"
            accessibilityLabel={t('locationClear')}
            size="sm"
            style={styles.clear}
            onPress={() => {
              setText('');
              setSaveFailed(false);
            }}
            testID="location-clear"
          />
        ) : null}
      </View>
      {searching ? <Text style={styles.notice}>{t('locationSearching')}</Text> : null}
      <View accessibilityRole="radiogroup" style={styles.results}>
        {places.map((place, i) => (
          <OptionCard
            key={`${place.label}-${i}`}
            title={place.title ?? place.label}
            description={place.subtitle}
            checked={i === picked}
            badge={BADGE_PIN}
            onPress={() => setPicked(i)}
            testID={`location-result-${i}`}
          />
        ))}
      </View>
      {approximate ? <Text style={styles.notice}>{t('locationGeocodeFailed')}</Text> : null}
      {saveError}
      <Text style={styles.footnote}>{t('locationChangeLater')}</Text>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  art: { width: '100%', flex: 1, minHeight: 200, alignItems: 'center', justifyContent: 'flex-end' },
  bunny: { width: 200, height: 227 },
  cloudA: { position: 'absolute', top: space[2], left: 0, width: 119, height: 58, opacity: 0.9 },
  cloudB: { position: 'absolute', top: space[8], right: 0, width: 188, height: 93, opacity: 0.9 },
  field: { justifyContent: 'center', marginBottom: space[4] },
  input: {
    backgroundColor: onboardingColors.optionBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingLeft: space[4],
    paddingRight: space[12],
    paddingVertical: space[4],
    fontSize: 16,
  },
  clear: { position: 'absolute', right: space[2] },
  results: { gap: space[3] },
  notice: { marginTop: space[2], color: colors.mutedForeground, fontSize: 13 },
  footnote: { ...type.caption, marginTop: space[6], textAlign: 'center', color: colors.mutedForeground },
  error: { ...type.caption, marginTop: space[3], color: colors.destructive },
});
