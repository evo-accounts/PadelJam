/**
 * Activity (UX-MEVT-17, B14): each `event_activity` row as who / what / when. Pure, so every
 * action name the server may write (0122's CHECK list, plus 0123's recurrence and 0127's
 * `removed` mode 'invitation') is covered by a unit test rather than by eyeballing a log.
 *
 * "Who" is the actor's name; the row's `what` is an i18n key WITHOUT the actor (the screen shows
 * the name as the entry's title) plus its interpolation values. "When" is a relative time from
 * i18n keys — never hard-coded English — falling back to a short date after a week.
 */

export type ActivityDetail = {
  target_name?: string | null;
  guest_name?: string | null;
  mode?: string | null;
  status?: string | null;
  changes?: unknown;
  count?: number | null;
  from?: number | string | null;
  to?: number | string | null;
  enabled?: boolean | null;
  round_number?: number | null;
  court_number?: number | null;
} | null;

export type ActivityInput = { action: string; detail: ActivityDetail };

/** The action names the server writes (0122 CHECK constraint, `event_activity_action_check`). */
export const ACTIVITY_ACTIONS = [
  'joined', 'left', 'confirmed', 'removed', 'guest_added', 'waitlist_joined', 'waitlist_claimed',
  'invited', 'invite_accepted', 'invite_declined',
  'partner_invite_sent', 'partner_invite_accepted', 'partner_invite_declined',
  'team_assigned', 'team_switched', 'team_removed',
  'marked_paid', 'marked_unpaid', 'marked_all_paid', 'fee_changed',
  'event_edited', 'recurrence_on', 'recurrence_off',
  'event_started', 'score_entered', 'score_edited', 'match_not_played', 'event_finished',
  'results_published', 'ranking_changed', 'event_cancelled',
] as const;

/** The `event_edited` change groups update_event reports (0122/0123 `v_changes`). */
export const EDIT_GROUPS = ['details', 'preferences', 'scoring', 'location', 'date'] as const;

export type ActivityWhat = {
  key: string;
  params: Record<string, string | number>;
  /** `event_edited` only: the change groups, each an i18n key, joined by the screen. */
  groups?: string[];
};

/**
 * The `what` of a row. `money` formats the fee_changed amounts (the screen passes formatMoney
 * bound to the current language).
 */
export function activityWhat(row: ActivityInput, money: (n: number) => string): ActivityWhat {
  const d = row.detail ?? {};
  const target = d.target_name ?? d.guest_name ?? '—';
  const plain = (key: string): ActivityWhat => ({ key, params: { target } });
  switch (row.action) {
    case 'left':
      return plain(d.status === 'waiting_list' ? 'actWhat_left_waitlist' : 'actWhat_left');
    case 'removed':
      return plain(
        d.mode === 'to_invited'
          ? 'actWhat_removed_to_invited'
          : d.mode === 'invitation'
            ? 'actWhat_removed_invitation'
            : 'actWhat_removed',
      );
    case 'marked_all_paid':
      return typeof d.count === 'number'
        ? { key: 'actWhat_marked_all_paid_count', params: { count: d.count } }
        : plain('actWhat_marked_all_paid');
    case 'fee_changed': {
      const from = Number(d.from);
      const to = Number(d.to);
      if (d.from == null || d.to == null || !Number.isFinite(from) || !Number.isFinite(to)) return plain('actWhat_fee_changed');
      return { key: 'actWhat_fee_changed_amounts', params: { from: money(from), to: money(to) } };
    }
    case 'event_edited': {
      const changes = Array.isArray(d.changes) ? d.changes.filter((c): c is string => typeof c === 'string') : [];
      const known = changes.filter((c) => (EDIT_GROUPS as readonly string[]).includes(c));
      if (known.length === 0) return plain('actWhat_event_edited');
      return { key: 'actWhat_event_edited_groups', params: {}, groups: known.map((c) => `actEditGroup_${c}`) };
    }
    case 'ranking_changed':
      return plain(d.enabled === false ? 'actWhat_ranking_off' : d.enabled === true ? 'actWhat_ranking_on' : 'actWhat_ranking_changed');
    case 'score_entered':
    case 'score_edited':
    case 'match_not_played':
      return typeof d.round_number === 'number' && typeof d.court_number === 'number'
        ? { key: `actWhat_${row.action}_at`, params: { round: d.round_number, court: d.court_number } }
        : plain(`actWhat_${row.action}`);
    default:
      // An action a newer server logs before this build knows it reads neutrally.
      return (ACTIVITY_ACTIONS as readonly string[]).includes(row.action) ? plain(`actWhat_${row.action}`) : plain('actWhat_other');
  }
}

export type RelativeWhen =
  | { key: 'actAgoNow' }
  | { key: 'actAgoMinutes' | 'actAgoHours' | 'actAgoDays'; count: number }
  | { key: 'actAgoDate'; date: Date };

/** Under a minute: now; then minutes, hours, days up to a week; after that the date itself. */
export function relativeWhen(iso: string, now: number = Date.now()): RelativeWhen {
  const at = new Date(iso);
  const minutes = Math.floor((now - at.getTime()) / 60_000);
  if (minutes < 1) return { key: 'actAgoNow' };
  if (minutes < 60) return { key: 'actAgoMinutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'actAgoHours', count: hours };
  const days = Math.floor(hours / 24);
  if (days < 7) return { key: 'actAgoDays', count: days };
  return { key: 'actAgoDate', date: at };
}
