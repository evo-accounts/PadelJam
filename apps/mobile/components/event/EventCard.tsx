import { eventStatusKey, useGroupEvents } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';
import { Card } from '../../components/ui';
import { EventThumb } from './EventThumb';

/** The element type of the group-events hook data: the `events` table Row. */
type EventRow = NonNullable<ReturnType<typeof useGroupEvents>['data']>[number];

/** Capitalize the first character of a raw enum value (rest left untouched). */
function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Format an ISO timestamp like `Sat 14 Jun · 18:00`. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

/**
 * A tappable card summarising one event: thumbnail (or an icon placeholder), name, format meta,
 * date/time and — only when it says something — a status badge. Presentational — the caller
 * supplies the row and an onPress.
 *
 * No badge for an upcoming event (UX-JEVT-01): every listed event is upcoming, so "Upcoming" said
 * nothing. Starting now / Live / Completed still carry meaning and keep theirs.
 *
 * Two arrangements of the same content (UX-GLOB-09): `vertical` is a fixed-width
 * card for a horizontally scrolling rail (image on top, text below); `horizontal`
 * (the default, and the only look this card had before) is a full-width row for
 * a list screen, with a trailing chevron. Nothing about WHAT is shown changes
 * between the two — only how it is arranged.
 */
export function EventCard({
  event,
  onPress,
  orientation = 'horizontal',
  railWidth = 260,
}: {
  event: EventRow & { distance_m?: number | null };
  onPress: () => void;
  orientation?: 'vertical' | 'horizontal';
  railWidth?: number;
}) {
  const { t } = useT('event');
  const { t: td } = useT('discovery');

  const typeLabel = t(`type${cap(event.event_type)}Label`);
  const specLabel = t(`spec${cap(event.specification)}Label`);

  const distance =
    event.distance_m == null
      ? null
      : event.distance_m < 1000
        ? td('distanceNear')
        : td('distanceKm', { km: (event.distance_m / 1000).toFixed(1) });

  // Derived from status AND the clock: an event stays 'scheduled' until someone
  // taps start, so a 19:00 event at 19:01 must not still read "Upcoming".
  const status = eventStatusKey(event.status, event.starts_at);
  const badgeStyle =
    status === 'statusInProgress'
      ? styled.badgeLive
      : status === 'statusStartingNow'
        ? styled.badgeStarting
        : status === 'statusCompleted'
          ? styled.badgeDone
          : null;
  const badgeTextStyle =
    status === 'statusInProgress'
      ? styled.badgeTextLive
      : status === 'statusStartingNow'
        ? styled.badgeTextStarting
        : status === 'statusCompleted'
          ? styled.badgeTextDone
          : null;

  const badge =
    status === 'statusScheduled' ? null : (
      <View style={[styled.badge, badgeStyle]}>
        <Text style={[styled.badgeText, badgeTextStyle]} numberOfLines={1}>
          {t(status)}
        </Text>
      </View>
    );
  const meta = (
    <Text style={styled.meta} numberOfLines={1}>
      {`${typeLabel} · ${specLabel}`}
    </Text>
  );
  const when = (
    <Text style={styled.when} numberOfLines={1}>
      {formatWhen(event.starts_at)}
    </Text>
  );
  const distanceText = distance ? <Text style={styled.distance}>{distance}</Text> : null;

  if (orientation === 'vertical') {
    return (
      <Card
        padding="none"
        style={[styled.cardVertical, { width: railWidth }]}
        onPress={onPress}
        testID={`event-card-${event.id}`}
      >
        <EventThumb path={event.thumbnail_path} shape="rail" />
        <View style={styled.bodyVertical}>
          <Text style={styled.name} numberOfLines={2}>
            {event.name}
          </Text>
          {meta}
          {when}
          {distanceText}
          {badge}
        </View>
      </Card>
    );
  }

  return (
    <Card padding="none" style={styled.card} onPress={onPress} testID={`event-card-${event.id}`}>
      <EventThumb path={event.thumbnail_path} shape="row" />
      <View style={styled.body}>
        <Text style={styled.name} numberOfLines={1}>
          {event.name}
        </Text>
        {meta}
        {when}
        {distanceText}
      </View>
      {badge}
      <Text style={styled.chevron} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Card>
  );
}

const styled = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  cardVertical: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  body: { flex: 1, gap: 4 },
  bodyVertical: { padding: 12, gap: 4, alignItems: 'flex-start' },
  name: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  when: { fontSize: 13, color: colors.foreground, fontWeight: '500' },
  distance: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeStarting: { backgroundColor: palette.yellow[100] },
  badgeTextStarting: { color: palette.yellow[800] },
  badgeLive: { backgroundColor: palette.green[100] },
  badgeTextLive: { color: colors.successStrong },
  badgeDone: { backgroundColor: colors.muted },
  badgeTextDone: { color: colors.mutedForeground },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
