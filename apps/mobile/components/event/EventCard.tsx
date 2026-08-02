import { useGroupEvents } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';
import { Card } from '../../components/ui';

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
    <Card padding="none" style={styled.card} onPress={onPress}>
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
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.muted },
  body: { flex: 1, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
  meta: { fontSize: 13, color: colors.mutedForeground, fontWeight: '600' },
  when: { fontSize: 13, color: colors.foreground, fontWeight: '500' },
  distance: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeScheduled: { backgroundColor: palette.purple[100] },
  badgeTextScheduled: { color: colors.primary },
  badgeLive: { backgroundColor: palette.green[100] },
  badgeTextLive: { color: colors.successStrong },
  badgeDone: { backgroundColor: colors.muted },
  badgeTextDone: { color: colors.mutedForeground },
});
