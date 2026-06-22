export interface MatchStatusLike { status: string }

/** A round (or the whole event) is scored when every match is no longer pending. */
export function allScored(matches: MatchStatusLike[]): boolean {
  return matches.length > 0 && matches.every((m) => m.status !== 'pending');
}

/** Can the organizer start? Individual events need numCourts*4 confirmed players;
 *  team events need numCourts*2 confirmed teams. */
export function setupComplete(input: {
  specification: string;
  confirmedCount: number;
  confirmedTeamCount: number;
  numCourts: number;
}): boolean {
  if (input.specification === 'team') {
    return input.confirmedTeamCount >= input.numCourts * 2;
  }
  return input.confirmedCount >= input.numCourts * 4;
}

/** Resolve a standings row's display name. */
export function standingsName(
  row: { entity_id: string; is_team: boolean },
  participantNameById: Record<string, string>,
  teamNumberById: Record<string, number>,
  teamLabel: (n: number) => string,
): string {
  if (row.is_team) return teamLabel(teamNumberById[row.entity_id] ?? 0);
  return participantNameById[row.entity_id] ?? '—';
}
