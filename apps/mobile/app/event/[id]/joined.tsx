/**
 * "You are in" (UX-JEVT-03): shown full screen after accepting an invitation or joining with a
 * confirmed spot. Add to calendar opens the OS event editor; Close returns to the event page,
 * which now shows the "You are going" banner.
 */
import { useEvent } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addToCalendar } from '@/lib/eventCalendar';
import { eventSubtitle } from '@/lib/eventFormat';
import { eventPlace, mapsQuery } from '@/lib/eventLocation';
import { EventThumb } from '../../../components/event/EventThumb';
import { colors, space } from '../../../theme';
import { Button, Text, useBanner } from '../../../components/ui';

export default function EventJoinedScreen() {
  const { t, i18n } = useT('event');
  const router = useRouter();
  const banner = useBanner();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event } = useEvent(id);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/event/${id}` as never));
  const place = event ? eventPlace(event) : null;

  const onCalendar = async () => {
    if (!event || calendarBusy) return;
    setCalendarBusy(true);
    const result = await addToCalendar({
      title: event.name,
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      location: place ? mapsQuery(place) : null,
      notes: event.description,
    }).finally(() => setCalendarBusy(false));
    if (result === 'denied') banner.show(t('calendarDenied'));
    else if (result === 'error') banner.show(t('calendarError'));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <EventThumb path={event?.thumbnail_path} shape="hero" style={styles.image} />
        <Text variant="display" style={styles.center} accessibilityRole="header" testID="event-joined-title">
          {t('youAreInTitle')}
        </Text>
        {event ? (
          <>
            <Text variant="heading" style={styles.center}>
              {event.name}
            </Text>
            <Text variant="body" tone="muted" style={styles.center}>
              {eventSubtitle(event.starts_at, place?.name, i18n.language)}
            </Text>
          </>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button label={t('addToCalendarAction')} fullWidth loading={calendarBusy} onPress={() => void onCalendar()} testID="event-joined-calendar" />
        <Button label={t('closeCta')} variant="outline" fullWidth onPress={close} testID="event-joined-close" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: space[6], gap: space[3] },
  image: { alignSelf: 'stretch', marginBottom: space[4] },
  center: { textAlign: 'center' },
  actions: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[2] },
});
