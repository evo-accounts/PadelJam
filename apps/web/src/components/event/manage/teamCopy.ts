/**
 * Copy shared by the team dialogs: what a candidate IS, under their name ("Interested",
 * "In Team 3"…), so the organizer knows who gets confirmed by a placement and who moves.
 * Web's twin of mobile's `teamCopy.ts` (#245); web's `teamLabel` takes `{{number}}`.
 */
import type { Candidate } from './teamBoard';

type T = (key: string, options?: Record<string, unknown>) => string;

export function candidateSubtitle(t: T, c: Pick<Candidate, 'kind' | 'team' | 'guest'>): string {
  const kind =
    c.kind === 'team'
      ? t('tmKindTeam', { team: t('teamLabel', { number: c.team }) })
      : c.kind === 'confirmed'
        ? t('tmKindConfirmed')
        : c.kind === 'interested'
          ? t('tmKindInterested')
          : c.kind === 'invited'
            ? t('tmKindInvited')
            : t('tmKindWaiting');
  return c.guest ? `${kind} · ${t('guestTag')}` : kind;
}
