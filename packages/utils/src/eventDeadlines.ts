/** Players may join up to 6h before start; leave up to 12h before. Both are fixed (JM-18). */
export const JOIN_CUTOFF_MS = 6 * 60 * 60 * 1000;
export const LEAVE_CUTOFF_MS = 12 * 60 * 60 * 1000;

export interface DeadlineState {
  joinCutoffMs: number;
  leaveCutoffMs: number;
  joinClosed: boolean;
  leaveLocked: boolean;
}

/**
 * Derive the join/leave cutoffs (absolute epoch ms) and whether each has passed at `nowMs`.
 * Fails open (nothing closed/locked) when `startsAtIso` cannot be parsed — the server RPCs
 * remain the source of truth.
 */
export function deadlineState(startsAtIso: string, nowMs: number): DeadlineState {
  const startMs = Date.parse(startsAtIso);
  if (Number.isNaN(startMs)) {
    return { joinCutoffMs: NaN, leaveCutoffMs: NaN, joinClosed: false, leaveLocked: false };
  }
  const joinCutoffMs = startMs - JOIN_CUTOFF_MS;
  const leaveCutoffMs = startMs - LEAVE_CUTOFF_MS;
  return {
    joinCutoffMs,
    leaveCutoffMs,
    joinClosed: nowMs > joinCutoffMs,
    leaveLocked: nowMs > leaveCutoffMs,
  };
}

/** Compact, English-first countdown: "2d 4h", "1h 30m", "5m", "<1m"; "" when expired. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '';
  const totalMinutes = Math.floor(msRemaining / 60_000);
  if (totalMinutes < 1) return '<1m';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
