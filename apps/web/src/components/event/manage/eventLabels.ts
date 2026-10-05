import type { EventDetail } from '@padel/api';

/**
 * The read-only labels Manage Event shows for an event (UX-MEVT-03/09/20): format, modality,
 * scoring, fee and a one-line preferences summary. Pure over a `t` so the dashboard and the
 * Duplicate dialog say exactly the same thing. Port of mobile's `eventLabels.ts`.
 */
type T = (key: string, options?: Record<string, unknown>) => string;

const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

export const formatLabel = (t: T, e: Pick<EventDetail, 'event_type'>) => t(`type${cap(e.event_type)}Label`);

export const modalityLabel = (t: T, e: Pick<EventDetail, 'specification'>) => t(`spec${cap(e.specification)}Label`);

export function scoringLabel(t: T, e: Pick<EventDetail, 'scoring_mode' | 'scoring_value'>): string {
  const mode = t(`scoring${cap(e.scoring_mode)}Label`);
  return e.scoring_mode === 'classic' || e.scoring_value == null ? mode : `${mode} · ${e.scoring_value}`;
}

export function feeLabel(
  t: T,
  e: Pick<EventDetail, 'entrance_fee_enabled' | 'entrance_fee_amount' | 'entrance_fee_method'>,
): string {
  if (!e.entrance_fee_enabled) return t('feeFree');
  const amount = `${e.entrance_fee_amount ?? 0}`;
  return e.entrance_fee_method ? `${amount} · ${t(`fee${cap(e.entrance_fee_method)}Label`)}` : amount;
}

/** "Private · Stand-by +2 · 5 · Cash" — what is switched on, or "Default settings" when nothing is. */
export function preferencesSummary(
  t: T,
  e: Pick<
    EventDetail,
    | 'is_private'
    | 'group_id'
    | 'allow_standby'
    | 'standby_spots'
    | 'entrance_fee_enabled'
    | 'entrance_fee_amount'
    | 'entrance_fee_method'
    | 'players_submit_results'
  >,
): string {
  const parts: string[] = [];
  // A group-less event is always private; saying so on every one of them says nothing.
  if (e.is_private && e.group_id != null) parts.push(t('prefSummaryPrivate'));
  if (e.allow_standby) parts.push(t('prefSummaryStandby', { count: e.standby_spots ?? 0 }));
  if (e.entrance_fee_enabled) parts.push(feeLabel(t, e));
  if (e.players_submit_results) parts.push(t('prefSummaryResults'));
  return parts.length > 0 ? parts.join(' · ') : t('prefSummaryNone');
}
