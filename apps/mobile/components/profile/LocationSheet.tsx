/**
 * Pick a place, get coordinates back — for UX-SET-02's location field.
 *
 * The audit asks Account Settings to open "the in-app map picker used in onboarding". Neither half
 * of that exists: onboarding's location step is a geocoded text search, and
 * `components/community/LocationPickerSheet.tsx` — the thing that looks like a map picker — says
 * in its own header that the map area is a static placeholder, searches seeded VENUES, and hands
 * back free text with NO coordinates. `profiles.location_point` is a geography column whose only
 * sanctioned writer is `set_my_location(lat, lng, text)`, so free text cannot feed it.
 *
 * So this is the onboarding behaviour in a sheet, sharing its resolution through
 * `useGeocodeSearch` rather than growing a second geocode path. Confirm stays disabled until the
 * lookup finishes — the same gate onboarding's Continue uses. It always finishes: when it cannot
 * place the text, it hands back the text with null coordinates and says so, rather than leaving
 * Confirm dead with nothing on screen to explain it.
 */
import { useT } from '@padel/i18n';
import * as Location from 'expo-location';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatAddress, useGeocodeSearch, type ResolvedPlace } from '@/lib/useGeocodeSearch';
import { space } from '../../theme';
import { BottomSheet, Button, SearchInput, Text } from '../ui';

export function LocationSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (place: ResolvedPlace) => void;
}) {
  const { t } = useT('profile');
  const [text, setText] = useState('');
  const [locating, setLocating] = useState(false);
  const { resolved, searching, approximate } = useGeocodeSearch(text);

  const pick = (place: ResolvedPlace) => {
    setText('');
    onPick(place);
    onClose();
  };

  const useCurrent = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      pick({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        // A coordinate with no name is still a valid answer — the label is what the profile
        // displays, and an empty one is better than refusing the pick outright.
        label: formatAddress(places[0]),
      });
    } catch {
      /* permission or lookup failure: the sheet stays open and the user can type instead */
    } finally {
      setLocating(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('locationLabel')} testID="location-sheet">
      <SearchInput
        value={text}
        onChangeText={setText}
        placeholder={t('locationSearchPlaceholder')}
        testID="location-search"
      />
      {searching ? (
        <Text variant="hint" tone="muted">
          {t('locationSearching')}
        </Text>
      ) : null}
      {resolved ? (
        <Text variant="bodyStrong" testID="location-resolved">
          {resolved.label}
        </Text>
      ) : null}
      {approximate ? (
        <Text variant="hint" tone="muted" testID="location-approximate">
          {t('locationApproximate')}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          fullWidth
          label={t('locationConfirm')}
          disabled={!resolved}
          onPress={() => resolved && pick(resolved)}
          testID="location-confirm"
        />
        <Button
          variant="outline"
          fullWidth
          label={t('locationUseCurrent')}
          loading={locating}
          onPress={useCurrent}
          testID="location-current"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space[2], marginTop: space[3] },
});
