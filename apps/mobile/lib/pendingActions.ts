/**
 * JM-38 / join-manage-event.md section 4.7: the setup tasks an organizer still has to do
 * before a scheduled event can start. Pure so it can be tested without rendering.
 */
export type PendingActionKey = 'addPlayers' | 'setUpTeams' | 'setLocation' | 'assignCourts';

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
  venueId: string | null;
  venueCourtCount: number;
  assignedCourtCount: number;
};

export function pendingActions(i: PendingActionsInput): PendingAction[] {
  const rows: PendingAction[] = [];
  const manage = `/event/${i.eventId}/manage`;
  const edit = `/event/${i.eventId}/edit`;

  const missingPlayers = i.numCourts * 4 - i.confirmedCount;
  if (missingPlayers > 0) rows.push({ key: 'addPlayers', count: missingPlayers, href: manage });

  if (i.specification === 'team') {
    const missingTeams = i.numCourts * 2 - i.confirmedTeamCount;
    if (missingTeams > 0) rows.push({ key: 'setUpTeams', count: missingTeams, href: manage });
  }

  if (!i.hasLocation) rows.push({ key: 'setLocation', count: 0, href: edit });

  if (i.venueId != null && i.venueCourtCount > 0 && i.assignedCourtCount === 0) {
    rows.push({ key: 'assignCourts', count: 0, href: edit });
  }
  return rows;
}
