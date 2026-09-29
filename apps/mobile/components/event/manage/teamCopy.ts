/**
 * Copy shared by the team sheets: what a candidate IS, under their name ("Interested",
 * "In Team 3"…), so the organizer knows who gets confirmed by a placement and who moves.
 */
import type { Candidate } from './teamBoard';

type T = (key: string, options?: Record<string, unknown>) => string;

export function candidateSubtitle(t: T, c: Pick<Candidate, 'kind' | 'team' | 'guest'>): string {
  const kind =
    c.kind === 'team'
      ? t('tmKindTeam', { team: t('teamLabel', { n: c.team }) })
      : c.kind === 'confirmed'
        ? t('tmKindConfirmed')
        : c.kind === 'interested'
          ? t('tmKindInterested')
          : c.kind === 'invited'
            ? t('tmKindInvited')
            : t('tmKindWaiting');
  return c.guest ? `${kind} · ${t('guestTag')}` : kind;
}
