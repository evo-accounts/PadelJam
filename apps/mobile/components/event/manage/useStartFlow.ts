import {
  useEventParticipants,
  useEventTeams,
  useStartEvent,
  type EventDetail,
  type EventType,
} from '@padel/api';
import { useT } from '@padel/i18n';

import { mixedBalance } from '@/lib/mixedBalance';

/**
 * Start event, shared by the event page (from the scheduled time, UX-MEVT-01) and Manage Event
 * (any time, UX-MEVT-03). The gate is today's start_event rules — every court full, a mixed event
 * balanced, a team event's teams complete; M5 rewrites them (decision 1, migration 0122).
 *
 * The button never looks disabled (UX-GLOB-06): `blocker` is the reason a tap would fail, which
 * the caller raises as a banner instead of starting.
 *
 * Takes the id separately so the event page can call it before its loading/no-access returns.
 */
export function useStartFlow(eventId: string, event: EventDetail | null | undefined) {
  const { t } = useT('event');
  const { data: participantsData } = useEventParticipants(eventId);
  const { data: teamsData } = useEventTeams(eventId);
  const startEvent = useStartEvent(eventId);
  const participants = participantsData ?? [];
  if (event == null) return { blocker: null, start: () => Promise.reject(new Error('event_not_found')), pending: false };

  // The server counts status='confirmed' regardless of is_standby.
  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const confirmedTeams = (teamsData ?? []).filter((tm) => tm.is_confirmed).length;
  const setupComplete =
    confirmed.length >= event.num_courts * 4 &&
    (event.specification !== 'team' || confirmedTeams >= event.num_courts * 2);

  // Mixed events also need equal men and women with no unknown gender (start_event, 0092).
  const mixed = event.specification === 'mixed' ? mixedBalance(participants) : null;
  const mixedHint =
    mixed != null && !mixed.balanced
      ? mixed.unknown > 0
        ? t('mixedGenderMissingHint', { count: mixed.unknown })
        : t('mixedUnbalancedHint', {
            men: t('mixedMenCount', { count: mixed.men }),
            women: t('mixedWomenCount', { count: mixed.women }),
          })
      : null;

  const blocker = mixedHint ?? (setupComplete ? null : t('startSetupIncomplete', { needed: event.num_courts * 4 }));

  const start = () =>
    startEvent.mutateAsync({
      eventType: event.event_type as EventType,
      specification: event.specification,
      confirmedParticipantIds: [...confirmed].sort((a, b) => a.joined_at.localeCompare(b.joined_at)).map((p) => p.id),
      numCourts: event.num_courts,
    });

  return { blocker, start, pending: startEvent.isPending };
}
