import { useSearchVenues } from '@padel/api';
import { useT } from '@padel/i18n';
import { geocodeQuery } from '@padel/utils';
import * as Location from 'expo-location';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { geocodeAddress } from '@/lib/geocode';

import type { EventDraft } from './wizard/draft';
import { colors, palette } from '../../theme';
import { Button, EmptyState, emptyIcon } from '../ui';

/**
 * The edit screen's location section: search the registry, or type a name and address, or use
 * the device's position. This was the wizard's Location step until UX-CEVT-06 rebuilt that one
 * around the venue registry; editing an event (UX-MEVT, not yet audited) keeps this form.
 */
export function EventLocationFields({
  draft,
  patch,
}: {
  draft: EventDraft;
  patch: (partial: Partial<EventDraft>) => void;
}) {
  const { t } = useT('event');
  const [venueQuery, setVenueQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoNotFound, setGeoNotFound] = useState(false);
  const venues = useSearchVenues(venueQuery);

  const runGeocode = async (query: string | null) => {
    if (!query || geocoding) return;
    setGeocoding(true);
    setGeoNotFound(false);
    const r = await geocodeAddress(query);
    if (r) patch({ locationLat: r.lat, locationLng: r.lng });
    else setGeoNotFound(true);
    setGeocoding(false);
  };

  const pickVenue = (id: string, name: string) =>
    patch({
      venueId: id,
      manualLocationName: name,
      manualLocationAddress: undefined,
      locationLat: undefined,
      locationLng: undefined,
      hasLocation: true,
    });

  const useMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    setDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDenied(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const label = [place?.name, place?.city ?? place?.subregion, place?.region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(', ');
      patch({
        venueId: undefined,
        manualLocationName: label || draft.manualLocationName,
        locationLat: pos.coords.latitude,
        locationLng: pos.coords.longitude,
        hasLocation: true,
      });
    } catch {
      // GPS or reverse-geocode failure. There was no catch here, so this escaped the press
      // handler as an unhandled rejection. The step stays as it was and the organiser can pick a
      // venue or type a name instead — `denied` is not set, because permission was not the problem.
    } finally {
      setLocating(false);
    }
  };

  const setManualName = (text: string) =>
    patch({
      venueId: undefined,
      manualLocationName: text,
      hasLocation: text.trim().length > 0 || (draft.manualLocationAddress ?? '').trim().length > 0,
    });
  const setManualAddress = (text: string) =>
    patch({
      venueId: undefined,
      manualLocationAddress: text,
      hasLocation: (draft.manualLocationName ?? '').trim().length > 0 || text.trim().length > 0,
    });

  const results = venues.data ?? [];

  return (
    <View style={styles.container}>

      <Text style={styles.label}>{t('searchVenueLabel')}</Text>
      <TextInput
        style={styles.input}
        value={venueQuery}
        onChangeText={setVenueQuery}
        placeholder={t('searchVenuePlaceholder')}
        placeholderTextColor={palette.slate[400]}
        autoCapitalize="none"
      />
      {venueQuery.trim().length > 0 ? (
        venues.isLoading ? (
          <ActivityIndicator color={colors.foreground} style={{ marginTop: 8 }} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={emptyIcon('mappin')}
            title={t('venueResultsEmpty')}
            body={t('step5LocationEmptyBody')}
            testID="empty-step5-venues"
          />
        ) : (
          results.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.venueRow, draft.venueId === v.id && styles.venueRowOn]}
              onPress={() => { pickVenue(v.id, v.name); void runGeocode(geocodeQuery({ name: v.name, address: v.address })); }}
              accessibilityRole="button"
            >
              <Text style={styles.venueName}>{v.name}</Text>
            </Pressable>
          ))
        )
      ) : null}

      <Text style={styles.or}>{t('orEnterManually')}</Text>

      <Text style={styles.label}>{t('locationNameLabel')}</Text>
      <TextInput
        style={styles.input}
        value={draft.manualLocationName ?? ''}
        onChangeText={setManualName}
        placeholder={t('locationNamePlaceholder')}
        placeholderTextColor={palette.slate[400]}
      />
      <Text style={styles.label}>{t('locationAddressLabel')}</Text>
      <TextInput
        style={styles.input}
        value={draft.manualLocationAddress ?? ''}
        onChangeText={setManualAddress}
        placeholder={t('locationAddressPlaceholder')}
        placeholderTextColor={palette.slate[400]}
      />

      <Button
        label={geocoding ? t('locating') : t('findLocationCta')}
        variant="outline"
        fullWidth
        loading={geocoding}
        onPress={() => void runGeocode(geocodeQuery({ name: draft.manualLocationName, address: draft.manualLocationAddress }))}
      />
      {geoNotFound ? <Text style={styles.denied}>{t('locationNotFound')}</Text> : null}

      <Button
        label={locating ? t('locating') : t('useMyLocation')}
        variant="outline"
        fullWidth
        loading={locating}
        onPress={useMyLocation}
      />
      {draft.locationLat != null ? <Text style={styles.coords}>✓ {draft.locationLat.toFixed(4)}, {draft.locationLng?.toFixed(4)}</Text> : null}
      {denied ? <Text style={styles.denied}>{t('locationDenied')}</Text> : null}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  denied: { color: colors.destructive, fontSize: 12, marginTop: 6, textAlign: 'center' },
  venueRow: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginTop: 6, borderWidth: 1, borderColor: colors.muted },
  venueRowOn: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  venueName: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
  or: { textAlign: 'center', color: colors.mutedForeground, fontSize: 13, marginVertical: 12 },
  coords: { color: colors.successStrong, fontSize: 12, marginTop: 6, textAlign: 'center' },
});
