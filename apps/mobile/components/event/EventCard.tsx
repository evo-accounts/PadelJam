import { useGroupEvents } from '@padel/api';
import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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

function statusKey(
  status: EventRow['status'],
): 'statusScheduled' | 'statusInProgress' | 'statusCompleted' {
  if (status === 'in_progress') return 'statusInProgress';
  if (status === 'completed') return 'statusCompleted';
  return 'statusScheduled';
}

/**
 * A tappable card summarising one event: name, format meta, date/time and a
 * status badge. Presentational — the caller supplies the row and an onPress.
 */
export function EventCard({
  event,
  onPress,
}: {
  event: EventRow & { distance_m?: number | null };
  onPress: () => void;
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

  const badgeStyle =
    event.status === 'in_progress'
      ? styled.badgeLive
      : event.status === 'completed'
        ? styled.badgeDone
        : styled.badgeScheduled;
  const badgeTextStyle =
    event.status === 'in_progress'
      ? styled.badgeTextLive
      : event.status === 'completed'
        ? styled.badgeTextDone
        : styled.badgeTextScheduled;

  return (
    <Pressable style={styled.card} onPress={onPress} accessibilityRole="button">
      <View style={styled.thumb} />
      <View style={styled.body}>
        <View style={styled.headerRow}>
          <Text style={styled.name} numberOfLines={2}>
            {event.name}
          </Text>
          <View style={[styled.badge, badgeStyle]}>
            <Text style={[styled.badgeText, badgeTextStyle]} numberOfLines={1}>
              {t(statusKey(event.status))}
            </Text>
          </View>
        </View>
        <Text style={styled.meta} numberOfLines={1}>
          {`${typeLabel} · ${specLabel}`}
        </Text>
        <Text style={styled.when} numberOfLines={1}>
          {formatWhen(event.starts_at)}
        </Text>
        {distance ? <Text style={styled.distance}>{distance}</Text> : null}
      </View>
    </Pressable>
  );
}

const styled = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6EAF0',
    padding: 12,
    gap: 12,
  },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#F0F3F8' },
  body: { flex: 1, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  meta: { fontSize: 13, color: '#6B7685', fontWeight: '600' },
  when: { fontSize: 13, color: '#0B1F3A', fontWeight: '500' },
  distance: { fontSize: 12, color: '#6B7685', marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeScheduled: { backgroundColor: '#E6F0FF' },
  badgeTextScheduled: { color: '#0B7BFF' },
  badgeLive: { backgroundColor: '#E3F5EA' },
  badgeTextLive: { color: '#1A7F4B' },
  badgeDone: { backgroundColor: '#F0F3F8' },
  badgeTextDone: { color: '#6B7685' },
});
