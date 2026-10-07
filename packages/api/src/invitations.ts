/**
 * Sending community and group invitations so that a block refuses one person, not the whole send.
 *
 * Since 0141, invite_to_community and invite_to_group raise 'blocked' when an invitee and the
 * inviter are blocked either way (the rule invite_to_event has had since 0122). The two RPCs refuse
 * differently, and neither shape suits a multi-select picker as it stood:
 *
 *   invite_to_community  takes the whole list and refuses ALL of it — nothing is written — if any
 *                        one invitee is blocked, so one person stopped everybody;
 *   invite_to_group      takes one invitee, so the screens looped over the selection, and a blocked
 *                        person in the middle left everyone before them invited, nobody after them,
 *                        and the user with one generic error.
 *
 * Both hooks (useInviteMembers, useInviteToGroup) now send through here, so mobile and web behave
 * the same: everyone who can be invited is, and the screen says how many could not be.
 *
 * How a blocked person reaches a picker at all: 0140 hides their `profiles` row, so search never
 * returns them and list_following already left them out. Every list built from those alone (the
 * community picker, the group picker's connections and others) meets 'blocked' only for a block
 * made while the picker was open, or a person the search cache still held. The group picker's
 * "Community members" section is built from community_members instead, whose read policy (0024)
 * has no block clause: a member blocked either way comes back with `profiles: null`, and was
 * listed as "—" and could be picked. Both group screens now leave those rows out, so this is the
 * edge case there too. The server is still what refuses, and this is what copes when it does.
 *
 * The contract both hooks inherit:
 *   resolves  { invited, blocked } when at least one invitee was invited (`blocked` may be empty);
 *   rejects   Error('blocked') when every invitee was refused. Nobody was invited, which to the
 *             user is a failure, and it keeps a one-person call failing exactly as it did before —
 *             the web community page, which invites one person per button, relies on that;
 *   rejects   any other code at once (forbidden, a network error): those are not about one
 *             person. Whoever was invited before it stays invited; both RPCs leave a pending
 *             invitation as it is, so sending the same selection again is safe.
 */

/** Who was invited and who a block refused, by user id, in the order they were given. */
export type InviteOutcome = { invited: string[]; blocked: string[] };

// The mutationFns throw Error(mapPgError(error)), so the code is the message.
const isBlocked = (e: unknown): boolean => e instanceof Error && e.message === 'blocked';

// Nobody invited and somebody refused: the send failed, and says why.
function settle(outcome: InviteOutcome): InviteOutcome {
  if (outcome.invited.length === 0 && outcome.blocked.length > 0) throw new Error('blocked');
  return outcome;
}

/**
 * One call per invitee, in turn — invite_to_group's shape, and the fallback below. A 'blocked'
 * refusal is counted and the next person is still sent; anything else stops the send.
 */
export async function inviteEach(
  ids: readonly string[],
  sendOne: (id: string) => Promise<void>,
): Promise<InviteOutcome> {
  const outcome: InviteOutcome = { invited: [], blocked: [] };
  for (const id of ids) {
    try {
      await sendOne(id);
      outcome.invited.push(id);
    } catch (e) {
      if (!isBlocked(e)) throw e;
      outcome.blocked.push(id);
    }
  }
  return settle(outcome);
}

/**
 * The whole list in one call — invite_to_community's shape — which is the usual case and one
 * round trip. Only when that call is refused with 'blocked' (and wrote nothing: the RPC raises
 * inside one transaction) is the list sent again one person at a time, to invite everybody else
 * and find who was refused. A single invitee is not retried: their 'blocked' is the answer.
 */
export async function inviteAll(
  ids: readonly string[],
  sendMany: (ids: string[]) => Promise<void>,
): Promise<InviteOutcome> {
  try {
    await sendMany([...ids]);
    return { invited: [...ids], blocked: [] };
  } catch (e) {
    if (!isBlocked(e) || ids.length < 2) throw e;
  }
  return inviteEach(ids, (id) => sendMany([id]));
}

/** What a picker shows once a send settles: an i18n key, the count it pluralises on, and a tone. */
export type InviteNotice = { key: string; count?: number; tone: 'success' | 'error' };

/**
 * The banner or toast after a multi-select send — the choice the mobile community picker and both
 * group pickers make the same way, kept here so a test pins it rather than three inline copies.
 * `sentKey` is the screen's own "invitations sent" copy (the community and group namespaces word
 * it differently); the other keys exist in both namespaces.
 *
 *   resolved, nobody refused     sentKey
 *   resolved, some refused       inviteSentSomeBlocked, counting the refused
 *   rejected 'blocked'           invitesBlocked, counting the selection: the hooks reject 'blocked'
 *                                only when nobody could be invited, so every selected person was
 *                                refused
 *   rejected with anything else  the error's code, which the screens translate as they always
 *                                have (unknown_error when the namespace has no such key)
 */
export function inviteNotice(
  settled: { outcome: InviteOutcome } | { error: unknown },
  selected: number,
  sentKey: string,
): InviteNotice {
  if ('outcome' in settled) {
    const refused = settled.outcome.blocked.length;
    return refused > 0
      ? { key: 'inviteSentSomeBlocked', count: refused, tone: 'success' }
      : { key: sentKey, tone: 'success' };
  }
  const code = settled.error instanceof Error ? settled.error.message : 'unknown_error';
  return code === 'blocked'
    ? { key: 'invitesBlocked', count: selected, tone: 'error' }
    : { key: code, tone: 'error' };
}
