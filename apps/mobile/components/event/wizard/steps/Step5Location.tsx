import { useSearchVenues } from '@padel/api';
import { useT } from '@padel/i18n';
import { useDeferredValue, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { CourtCounter } from '../CourtCounter';
import type { WizardStepProps } from '../draft';
import { InfoNote } from '../InfoNote';
import {
  backToVenueList,
  chooseVenue,
  noLocation,
  openManualVenue,
  setManualCourtCount,
  setManualCourtName,
} from '../location';
import { VenueCard } from '../VenueCard';
import { colors, space } from '../../../../theme';
import { Button, EmptyState, emptyIcon, Field, SearchInput, Text } from '../../../ui';

/**
 * Location (UX-CEVT-06). Three ways to answer:
 *
 * 1. Pick a venue from the curated registry — the list shows every venue alphabetically and the
 *    search narrows it. The card is the answer: tapping it advances to Courts.
 * 2. "Add manually" (or the CTA on "Location not found") opens the manual venue form: optional
 *    name, required address, 1–20 courts with optional names, and a note that the venue serves
 *    this event only. It has fields, so the step shows the primary button; Courts is skipped.
 * 3. "I don't want to add a location", fixed at the bottom (`NoLocationFooter`), advances to a
 *    Courts step with only the count.
 *
 * Not a map search and no geolocation: the address is geocoded silently when the event is
 * created, to fill its point.
 */
export function Step5Location(props: WizardStepProps) {
  return props.draft.locationMode === 'manual' ? <ManualVenueForm {...props} /> : <VenueList {...props} />;
}

function VenueList({ draft, patch, advance }: WizardStepProps) {
  const { t } = useT('event');
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query.trim());
  const venues = useSearchVenues(term, { listAll: true });
  const rows = venues.data ?? [];
  const manual = () => patch(openManualVenue(draft));

  let body: React.ReactNode;
  if (venues.isLoading) {
    body = <ActivityIndicator color={colors.foreground} style={styles.loading} />;
  } else if (venues.isError) {
    body = (
      <EmptyState
        tone="error"
        title={t('venueListErrorTitle')}
        action={{ label: t('venueRetry'), onPress: () => void venues.refetch(), variant: 'outline' }}
        testID="venue-list-error"
      />
    );
  } else if (rows.length === 0) {
    // UX-GLOB-03: say what is missing and offer the way out — the manual form.
    body = (
      <EmptyState
        icon={emptyIcon('mappin')}
        title={term ? t('venueNotFoundTitle') : t('venueListEmptyTitle')}
        body={term ? t('venueNotFoundBody') : t('venueListEmptyBody')}
        action={{ label: t('addVenueManually'), onPress: manual }}
        testID="empty-step5-venues"
      />
    );
  } else {
    body = (
      <View style={styles.list}>
        {rows.map((v) => (
          <VenueCard
            key={v.id}
            venue={v}
            selected={draft.venueId === v.id}
            onPress={() => {
              const partial = chooseVenue(draft, v);
              if (advance) advance(partial);
              else patch(partial);
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('venueSearchPlaceholder')}
        testID="venue-search"
      />
      <Button
        label={`+ ${t('addVenueManually')}`}
        variant="ghost"
        onPress={manual}
        style={styles.addManually}
        testID="venue-add-manually"
      />
      {body}
    </View>
  );
}

function ManualVenueForm({ draft, patch, errors, clearError }: WizardStepProps) {
  const { t } = useT('event');
  const flagged = (key: string) => errors?.includes(key) ?? false;

  return (
    <View style={styles.container}>
      <InfoNote text={t('manualVenueBanner')} testID="manual-venue-note" />

      <Field
        label={t('manualVenueNameLabel')}
        value={draft.manualLocationName ?? ''}
        onChangeText={(v) => patch({ manualLocationName: v })}
        placeholder={t('locationNamePlaceholder')}
        maxLength={80}
        testID="manual-venue-name"
      />
      <Field
        label={t('locationAddressLabel')}
        required
        value={draft.manualLocationAddress ?? ''}
        onChangeText={(v) => {
          patch({ manualLocationAddress: v });
          clearError?.('manualLocationAddress');
        }}
        placeholder={t('locationAddressPlaceholder')}
        error={flagged('manualLocationAddress') ? t('manualAddressRequired') : undefined}
        maxLength={200}
        testID="manual-venue-address"
      />

      <CourtCounter
        value={draft.numCourts}
        onChange={(n) => {
          patch(setManualCourtCount(draft, n));
          clearError?.('numCourts');
        }}
      />

      <View style={styles.names}>
        <Text variant="label">{t('courtNamesLabel')}</Text>
        {Array.from({ length: draft.numCourts }, (_, i) => (
          <Field
            key={i}
            value={draft.manualCourtNames?.[i] ?? ''}
            onChangeText={(v) => patch(setManualCourtName(draft, i, v))}
            placeholder={t('courtNamePlaceholder', { number: i + 1 })}
            accessibilityLabel={t('courtNameA11y', { number: i + 1 })}
            maxLength={40}
          />
        ))}
      </View>

      <Button
        label={t('chooseFromVenueList')}
        variant="ghost"
        onPress={() => patch(backToVenueList())}
        testID="venue-back-to-list"
      />
    </View>
  );
}

/** Scenario 3, fixed at the bottom of the registry list; absent on the manual form. */
export function NoLocationFooter({ draft, advance }: WizardStepProps) {
  const { t } = useT('event');
  if (draft.locationMode === 'manual' || !advance) return null;
  return (
    <Button
      label={t('noLocationCta')}
      variant="outline"
      fullWidth
      onPress={() => advance(noLocation())}
      testID="venue-no-location"
    />
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
  list: { gap: space[3] },
  loading: { marginTop: space[4] },
  addManually: { alignSelf: 'flex-start', marginTop: -space[2] },
  names: { gap: space[2] },
});
