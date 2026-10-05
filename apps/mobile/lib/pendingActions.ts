/**
 * Pending actions (UX-MEVT-24): what the organizer still has to settle before the event runs, each
 * with the screen that resolves it. Pure so it can be tested without rendering; a resolved action
 * simply stops being returned.
 *
 *   teams     a team event with a confirmed player outside a complete team → Manage players, Teams view
 *   spots     fewer confirmed than the capacity (stand-by spots included, as start_event_check
 *             counts them)                                                  → Manage players
 *   payments  a fee event with a confirmed player who has not paid         → Payment list
 *   location  no location                                                   → Location & Courts
 *   courts    a location whose courts are not reserved yet (decision 13)    → Location & Courts
 */
export type PendingActionKey = 'teams' | 'spots' | 'payments' | 'location' | 'courts';

export type PendingAction = {
  key: PendingActionKey;
  /** Spots still open / players still to pay; 0 for the yes-or-no rows. */
  count: number;
  href: string;
};

export type PendingActionsInput = {
  eventId: string;
  specification: string;
  /** Capacity minus confirmed (stand-by included). */
  openSpots: number;
  teamsIncomplete: boolean;
  feeEnabled: boolean;
  /** Confirmed players who have not paid. */
  unpaid: number;
  hasLocation: boolean;
  courtsReserved: boolean;
};

export function pendingActions(i: PendingActionsInput): PendingAction[] {
  const players = `/event/${i.eventId}/manage-players`;
  const locationSheet = `/event/${i.eventId}/manage?sheet=location`;
  const rows: PendingAction[] = [];
  if (i.specification === 'team' && i.teamsIncomplete) rows.push({ key: 'teams', count: 0, href: `${players}?view=teams` });
  if (i.openSpots > 0) rows.push({ key: 'spots', count: i.openSpots, href: players });
  if (i.feeEnabled && i.unpaid > 0) rows.push({ key: 'payments', count: i.unpaid, href: `/event/${i.eventId}/payments` });
  if (!i.hasLocation) rows.push({ key: 'location', count: 0, href: locationSheet });
  else if (!i.courtsReserved) rows.push({ key: 'courts', count: 0, href: locationSheet });
  return rows;
}

type TeamLite = { is_confirmed: boolean; player_a: { id: string } | null; player_b: { id: string } | null };

/**
 * A confirmed player who is not in a complete, confirmed team — the client twin of
 * start_event's `teams_incomplete` (0122 `_start_blockers`).
 */
export function teamsIncomplete(confirmedIds: string[], teams: TeamLite[]): boolean {
  const paired = new Set<string>();
  for (const tm of teams) {
    if (tm.is_confirmed && tm.player_a && tm.player_b) {
      paired.add(tm.player_a.id);
      paired.add(tm.player_b.id);
    }
  }
  return confirmedIds.some((id) => !paired.has(id));
}
