/**
 * "Next occurrences" (UX-MEVT-22, decision 5): on a recurring event, Manage Event lists the next
 * four weekly slots (`event_next_occurrences`), between the Activity card and the actions. Each is
 * a card with the date, the day and time, the location, a status label and a chevron:
 *
 *   Scheduled  materialised — its invitations are out; opens its own event page
 *   Upcoming   not yet; opens the occurrence preview (`occurrence?slot=`), whose settings sheet
 *              edits its date & time, sends its invitation now or cancels it
 */
import { useEventNextOccurrences, type EventOccurrence } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { Badge, Card, Text } from '../../ui';
import { Chevron } from '../EventDetailParts';

/** "Fri, 9 Oct" and "Friday · 18:00", in the app's language. */
export function occurrenceWhen(iso: string, lang: string): { date: string; dayTime: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const day = d.toLocaleDateString(lang, { weekday: 'long' });
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, dayTime: `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}` };
}

export function occurrencePlace(o: EventOccurrence): string | null {
  return o.location_name ?? o.location_address ?? null;
}

export function NextOccurrences({ eventId }: { eventId: string }) {
  const { t, i18n } = useT('event');
  const router = useRouter();
  const { data } = useEventNextOccurrences(eventId);
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const open = (o: EventOccurrence) =>
    router.push(
      (o.status === 'scheduled' && o.event_id
        ? `/event/${o.event_id}`
        : `/event/${eventId}/occurrence?slot=${o.slot_date}`) as Href,
    );

  return (
    <View style={styles.section} testID="manage-occurrences">
      <Text variant="sectionTitle" accessibilityRole="header">
        {t('nextOccurrencesTitle')}
      </Text>
      {rows.map((o) => {
        const when = occurrenceWhen(o.starts_at, i18n.language);
        const place = occurrencePlace(o) ?? t('noLocationValue');
        const status = t(o.status === 'scheduled' ? 'occurrenceScheduled' : 'occurrenceUpcoming');
        return (
          <Card
            key={o.slot_date}
            padding="md"
            onPress={() => open(o)}
            accessibilityLabel={[when.date, when.dayTime, place, status].join(', ')}
            testID={`manage-occurrence-${o.slot_date}`}
            style={styles.card}
          >
            <View style={styles.head}>
              <Text variant="bodyStrong" style={styles.flex}>
                {when.date}
              </Text>
              <Badge label={status} tone={o.status === 'scheduled' ? 'success' : 'neutral'} />
              <Chevron />
            </View>
            <Text variant="caption" tone="muted">
              {when.dayTime}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {place}
            </Text>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[2], marginTop: space[2] },
  card: { gap: space[1] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  flex: { flex: 1 },
});
