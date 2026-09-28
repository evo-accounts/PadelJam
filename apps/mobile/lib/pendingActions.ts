/**
 * JM-38 / join-manage-event.md section 4.7: the setup tasks an organizer still has to do
 * before a scheduled event can start. Pure so it can be tested without rendering.
 *
 * Three rows: missing players, missing teams (team events only), and a missing location.
 */
export type PendingActionKey = 'addPlayers' | 'setUpTeams' | 'setLocation';

export type PendingAction = {
  key: PendingActionKey;
  /** Players or teams still missing; 0 for the boolean rows. */
  count: number;
  href: string;
};

export type PendingActionsInput = {
  eventId: string;
  specification: string;
  numCourts: number;
  confirmedCount: number;
  confirmedTeamCount: number;
  hasLocation: boolean;
};

export function pendingActions(i: PendingActionsInput): PendingAction[] {
  const rows: PendingAction[] = [];
  // The roster (and a team event's team builder) is Manage players; the location is Manage Event's
  // Edit Location & Courts sheet, opened on arrival (UX-MEVT-07).
  const manage = `/event/${i.eventId}/manage-players`;
  const locationSheet = `/event/${i.eventId}/manage?sheet=location`;

  const missingPlayers = i.numCourts * 4 - i.confirmedCount;
  if (missingPlayers > 0) rows.push({ key: 'addPlayers', count: missingPlayers, href: manage });

  if (i.specification === 'team') {
    const missingTeams = i.numCourts * 2 - i.confirmedTeamCount;
    if (missingTeams > 0) rows.push({ key: 'setUpTeams', count: missingTeams, href: manage });
  }

  if (!i.hasLocation) rows.push({ key: 'setLocation', count: 0, href: locationSheet });

  return rows;
}
