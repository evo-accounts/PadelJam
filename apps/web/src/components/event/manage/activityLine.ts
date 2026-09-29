import type { ActivityRow } from '@padel/api';

/**
 * One human sentence per `event_activity` row (UX-MEVT-17) — who did what. Every action name the
 * server can write has its own copy: 0122's CHECK constraint, recurrence_on/off (0123) and
 * 'removed' with mode 'invitation' (0127). An action a newer server logs before this build knows it
 * reads neutrally ("updated the event"), never as a raw action name.
 */
type T = (key: string, options?: Record<string, unknown>) => string;

export const ACTIVITY_KEYS: Record<string, string> = {
  joined: 'activityJoined',
  left: 'activityLeft',
  confirmed: 'activityConfirmed',
  removed: 'activityRemoved',
  guest_added: 'activityGuestAdded',
  waitlist_joined: 'activityWaitlistJoined',
  waitlist_claimed: 'activityWaitlistClaimed',
  invited: 'activityInvited',
  invite_accepted: 'activityInviteAccepted',
  invite_declined: 'activityInviteDeclined',
  partner_invite_sent: 'activityPartnerInviteSent',
  partner_invite_accepted: 'activityPartnerInviteAccepted',
  partner_invite_declined: 'activityPartnerInviteDeclined',
  team_assigned: 'activityTeamAssigned',
  team_switched: 'activityTeamSwitched',
  team_removed: 'activityTeamRemoved',
  marked_paid: 'activityMarkedPaid',
  marked_unpaid: 'activityMarkedUnpaid',
  marked_all_paid: 'activityMarkedAllPaid',
  fee_changed: 'activityFeeChanged',
  event_edited: 'activityEventEdited',
  recurrence_on: 'activityRecurrenceOn',
  recurrence_off: 'activityRecurrenceOff',
  event_started: 'activityEventStarted',
  score_entered: 'activityScoreEntered',
  score_edited: 'activityScoreEdited',
  match_not_played: 'activityMatchNotPlayed',
  event_finished: 'activityEventFinished',
  results_published: 'activityResultsPublished',
  ranking_changed: 'activityRankingChanged',
  event_cancelled: 'activityEventCancelled',
};

/** The `changes` update_event records on 'event_edited' (0122/0123). */
const EDIT_GROUPS = ['details', 'preferences', 'scoring', 'location', 'date'] as const;

type Detail = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function activityLine(t: T, row: ActivityRow, money: (n: number) => string): string {
  const d = (row.detail ?? {}) as Detail;
  const actor = row.profiles?.full_name ?? t('activitySomeone');
  const target = str(d.target_name) ?? str(d.guest_name) ?? t('activitySomeone');
  const base = { actor, target };

  switch (row.action) {
    case 'removed': {
      // 'to_invited' → back to the invited list; 'invitation' → an invitation revoked (0127).
      const mode = str(d.mode);
      if (mode === 'to_invited') return t('activityRemovedToInvited', base);
      if (mode === 'invitation') return t('activityInvitationRevoked', base);
      return t('activityRemoved', base);
    }
    case 'fee_changed': {
      const from = Number(d.from);
      const to = Number(d.to);
      if (d.to != null && Number.isFinite(to)) {
        return t('activityFeeChangedTo', {
          ...base,
          from: d.from != null && Number.isFinite(from) ? money(from) : '—',
          to: money(to),
        });
      }
      return t('activityFeeChanged', base);
    }
    case 'marked_all_paid': {
      const n = Number(d.count);
      return Number.isFinite(n) && d.count != null
        ? t('activityMarkedAllPaidCount', { ...base, count: n })
        : t('activityMarkedAllPaid', base);
    }
    case 'ranking_changed':
      if (d.enabled === true) return t('activityRankingOn', base);
      if (d.enabled === false) return t('activityRankingOff', base);
      return t('activityRankingChanged', base);
    case 'event_edited': {
      const changes = Array.isArray(d.changes) ? (d.changes as unknown[]) : [];
      const words = changes
        .filter((c): c is (typeof EDIT_GROUPS)[number] => EDIT_GROUPS.includes(c as never))
        .map((c) => t(`activityGroup_${c}`));
      return words.length > 0
        ? t('activityEventEditedWhat', { ...base, what: words.join(', ') })
        : t('activityEventEdited', base);
    }
    case 'score_entered':
    case 'score_edited': {
      const a = d.side_a;
      const b = d.side_b;
      const key = row.action === 'score_entered' ? 'activityScoreEnteredDetail' : 'activityScoreEditedDetail';
      if (typeof a === 'number' && typeof b === 'number' && d.round_number != null) {
        return t(key, { ...base, round: d.round_number, court: d.court_number ?? '—', score: `${a}–${b}` });
      }
      return t(ACTIVITY_KEYS[row.action] ?? 'activityOther', base);
    }
    case 'guest_added':
      return d.team_number != null
        ? t('activityGuestAddedTeam', { ...base, team: d.team_number })
        : t('activityGuestAdded', base);
    default:
      return t(ACTIVITY_KEYS[row.action] ?? 'activityOther', base);
  }
}

/**
 * "just now" · "5 min ago" · "3 h ago" · "yesterday" · "4 days ago", in the viewer's language
 * (Intl.RelativeTimeFormat); past a week, the date itself.
 */
export function relativeTime(iso: string, locale: string, t: T, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const sec = Math.round((nowMs - then) / 1000);
  if (sec < 60) return t('activityJustNow');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const min = Math.floor(sec / 60);
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.floor(min / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  const days = Math.floor(h / 24);
  if (days < 7) return rtf.format(-days, 'day');
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
