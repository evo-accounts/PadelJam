import { deadlineState } from './eventDeadlines';

export interface PSEvent {
  organizer_id: string;
  starts_at: string | null;
  num_courts: number;
  allow_standby: boolean;
  standby_spots: number | null;
}
export interface PSParticipant {
  user_id: string | null;
  status: string;
  is_standby: boolean;
}
export interface PSInvitation {
  invitee_id: string | null;
}

export interface ParticipationState<P, I> {
  me: P | null;
  myInvite: I | null;
  isOrganizer: boolean;
  regularCapacity: number;
  confirmedRegular: number;
  standbyUsed: number;
  totalCapacity: number;
  totalIn: number;
  joinClosed: boolean;
  leaveLocked: boolean;
  joinCutoffMs: number;
  leaveCutoffMs: number;
}

/**
 * Derives a viewer's relationship to an event plus capacity + deadline gating,
 * mirroring the mobile event-detail screen. Pure: no I/O, `nowMs` passed in.
 */
export function participationState<P extends PSParticipant, I extends PSInvitation>(
  event: PSEvent,
  participants: P[],
  invitations: I[],
  uid: string | null | undefined,
  nowMs: number,
): ParticipationState<P, I> {
  const me = participants.find((p) => p.user_id === uid) ?? null;
  const myInvite = invitations.find((i) => i.invitee_id === uid) ?? null;
  const isOrganizer = uid != null && uid === event.organizer_id;

  const regularCapacity = event.num_courts * 4;
  const confirmedRegular = participants.filter(
    (p) => p.status === 'confirmed' && !p.is_standby,
  ).length;
  const standbyUsed = participants.filter((p) => p.is_standby).length;
  const totalCapacity = regularCapacity + (event.allow_standby ? event.standby_spots ?? 0 : 0);
  const totalIn = confirmedRegular + standbyUsed;

  const { joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked } = deadlineState(
    event.starts_at ?? '',
    nowMs,
  );

  return {
    me,
    myInvite,
    isOrganizer,
    regularCapacity,
    confirmedRegular,
    standbyUsed,
    totalCapacity,
    totalIn,
    joinClosed,
    leaveLocked,
    joinCutoffMs,
    leaveCutoffMs,
  };
}
