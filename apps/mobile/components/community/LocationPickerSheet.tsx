/**
 * The location picker of UX-COMM-01: search, results, confirmation.
 *
 * The map area is a STATIC PLACEHOLDER and results come from seeded venues,
 * which is what the audit asks for "until a map provider is chosen". It reuses
 * `useSearchVenues` — the same `search_venues` RPC the event wizard's location
 * step uses — rather than introducing a second way to look an address up.
 *
 * What it writes back is the venue's ADDRESS where there is one, falling back to
 * its name: a community's location reads as a place ("Cascais, PT"), not as a
 * building. The id is deliberately not stored — `communities.location` is free
 * text, and pretending otherwise would imply a relationship the schema does not
 * have.
 */
import { useSearchVenues } from '@padel/api';
import { useT } from '@padel/i18n';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../../theme';
import { BottomSheet, Button, EmptyState, Field, ListRow, Text, emptyIcon } from '../ui';

type Venue = { id: string; name: string; address: string | null };

export function LocationPickerSheet({
  visible,
  onClose,
  onConfirm,
  initial,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (location: string) => void;
  initial?: string;
}) {
  const { t } = useT('community');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [chosen, setChosen] = useState<string | null>(initial ?? null);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data, isFetching } = useSearchVenues(term);
  const venues = (data ?? []) as Venue[];

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('locationPickerTitle')} testID="location-picker">
      <View style={styles.body}>
        {/* The map is a placeholder until a provider is chosen — it is labelled
            as such rather than drawn as a fake map, which would imply the pin
            means something. */}
        <View style={styles.map} accessible accessibilityLabel={t('locationMapPlaceholder')}>
          <Text variant="caption" tone="muted">
            {t('locationMapPlaceholder')}
          </Text>
        </View>

        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={t('locationSearchPlaceholder')}
          accessibilityLabel={t('locationSearchPlaceholder')}
          autoCapitalize="words"
          autoCorrect={false}
          testID="location-search"
        />

        <View style={styles.results}>
          {isFetching ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <FlatList
              data={venues}
              keyExtractor={(v) => v.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                term.trim().length > 0 ? (
                  <EmptyState icon={emptyIcon('magnifyingglass')} title={t('locationNoResults')} testID="empty-locations" />
                ) : null
              }
              renderItem={({ item }) => {
                const value = item.address ?? item.name;
                return (
                  <ListRow
                    title={item.name}
                    subtitle={item.address ?? undefined}
                    variant="plain"
                    selected={chosen === value}
                    onPress={() => setChosen(value)}
                    testID={`location-${item.id}`}
                  />
                );
              }}
            />
          )}
        </View>

        <Button
          label={t('locationConfirm')}
          size="lg"
          fullWidth
          disabled={!chosen}
          onPress={() => chosen && onConfirm(chosen)}
          testID="location-confirm"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[2] },
  map: {
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: { minHeight: 140, maxHeight: 240 },
});
