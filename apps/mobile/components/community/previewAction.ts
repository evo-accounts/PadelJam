/**
 * Which action the community preview offers (UX-COMM-04).
 *
 * The audit describes six situations across two axes — what the viewer's
 * standing is, and how the community lets people in — and gives each a
 * different button. Read from the screen that is five nested ternaries; pulled
 * out here it is a table, and a table can be tested without a renderer.
 *
 * Standing wins over privacy wherever they disagree, because an invitation or a
 * pending request is a fact about this person and privacy is only the default
 * for someone with no relationship yet. That ordering is what lets a private
 * community be joinable at all: 'private' offers nothing on its own, and an
 * invitation is the only thing that puts an action on the screen.
 */
import type { CommunityStandingState } from '@padel/api';

export type PreviewAction =
  /** Public: join outright. */
  | 'join'
  /** Request to join: ask, and wait for an admin. */
  | 'request'
  /** Already asked — the button says so, and tapping it cancels. */
  | 'requested'
  /** Invited: the inviter, then Decline beside Accept. */
  | 'invited'
  /** Nothing to offer: a member (the screen leaves), or a private community with no invitation. */
  | 'none';

export function previewAction(state: CommunityStandingState, privacy: string): PreviewAction {
  // A member has no business on the preview at all — the screen redirects them
  // into the tab — but the query can say 'member' for a frame after a join
  // lands, and an action rendered in that frame would be the wrong one.
  if (state === 'member') return 'none';
  if (state === 'invited') return 'invited';
  if (state === 'requested') return 'requested';
  if (privacy === 'public') return 'join';
  if (privacy === 'request_to_join') return 'request';
  // Private, uninvited. UX-COMM-04: "No plain Join action exists." Reaching this
  // screen at all takes a stale link — a private community is not discoverable.
  return 'none';
}

/**
 * Whether the rules toggle gates this action (UX-COMM-05: "Applies to all three
 * privacy settings").
 *
 * Accepting an invitation counts — it is a join, and `accept_invitation` takes
 * the same `p_ack` as `join_community`. Cancelling a request does not: nobody is
 * entering anything, and a toggle standing between someone and withdrawing
 * would be a trap rather than a gate.
 */
export function actionNeedsAck(action: PreviewAction): boolean {
  return action === 'join' || action === 'request' || action === 'invited';
}

/**
 * The preview's tabs, and who gets them (UX-COMM-04).
 *
 * "Public: all tabs accessible from the preview — Posts, Events, Groups, Members, About — with
 * About default." A request-to-join community shows "only About ... other tabs inaccessible",
 * and a private one is reached by invitation alone. So the strip appears for public communities
 * and nowhere else, which happens to line up exactly with what migration 0100 made readable:
 * showing a tab a non-member cannot read would render an empty state that looks like an empty
 * community.
 *
 * About is FIRST as well as default — it is the one tab every privacy mode shows, so it is the
 * one that must never move.
 */
export const PREVIEW_TABS = ['about', 'posts', 'events', 'groups', 'members'] as const;

export type PreviewTab = (typeof PREVIEW_TABS)[number];

/** i18n key per tab, so the strip and the member view read identically. */
export const PREVIEW_TAB_KEY: Record<PreviewTab, string> = {
  about: 'tabAbout',
  posts: 'tabPosts',
  events: 'tabEvents',
  groups: 'tabGroups',
  members: 'tabMembers',
};

export function previewHasTabs(privacy: string): boolean {
  return privacy === 'public';
}
