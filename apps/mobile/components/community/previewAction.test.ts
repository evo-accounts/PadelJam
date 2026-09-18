import { describe, expect, it } from 'vitest';

import {
  actionNeedsAck,
  PREVIEW_TAB_KEY,
  PREVIEW_TABS,
  previewAction,
  previewHasTabs,
} from './previewAction';

describe('previewAction', () => {
  it('offers the privacy-appropriate way in to someone with no relationship', () => {
    expect(previewAction('none', 'public')).toBe('join');
    expect(previewAction('none', 'request_to_join')).toBe('request');
  });

  // UX-COMM-04: "No plain Join action exists" for a private community.
  it('offers a private community nothing without an invitation', () => {
    expect(previewAction('none', 'private')).toBe('none');
  });

  it('lets an invitation override every privacy mode', () => {
    expect(previewAction('invited', 'private')).toBe('invited');
    expect(previewAction('invited', 'public')).toBe('invited');
    expect(previewAction('invited', 'request_to_join')).toBe('invited');
  });

  // An invitation outranks a request: accepting resolves both at once.
  it('prefers an invitation to a pending request', () => {
    expect(previewAction('invited', 'request_to_join')).toBe('invited');
    expect(previewAction('requested', 'request_to_join')).toBe('requested');
  });

  /**
   * The frame after a join lands, before the screen has navigated. Rendering
   * "Join" there would offer an action that is already done.
   */
  it('offers a member nothing, whatever the privacy', () => {
    expect(previewAction('member', 'public')).toBe('none');
    expect(previewAction('member', 'request_to_join')).toBe('none');
    expect(previewAction('member', 'private')).toBe('none');
  });

  it('treats an unknown privacy value as offering nothing', () => {
    expect(previewAction('none', 'whatever-the-server-adds-next')).toBe('none');
  });
});

describe('actionNeedsAck', () => {
  // UX-COMM-05: the gate applies to all three privacy settings.
  it('gates every way IN behind the rules toggle', () => {
    expect(actionNeedsAck('join')).toBe(true);
    expect(actionNeedsAck('request')).toBe(true);
    expect(actionNeedsAck('invited')).toBe(true);
  });

  it('does not gate cancelling a request, which is a way out', () => {
    expect(actionNeedsAck('requested')).toBe(false);
    expect(actionNeedsAck('none')).toBe(false);
  });
});

describe('previewHasTabs', () => {
  /**
   * The strip appears exactly where migration 0100 made the content readable. If these two ever
   * disagree, the preview shows a tab whose queries RLS refuses — and an empty state is
   * indistinguishable from an empty community, so it reads as fact rather than as a wall.
   */
  it('gives the five tabs to a public community only', () => {
    expect(previewHasTabs('public')).toBe(true);
    expect(previewHasTabs('request_to_join')).toBe(false);
    expect(previewHasTabs('private')).toBe(false);
  });

  it('treats an unknown privacy value as no tabs', () => {
    expect(previewHasTabs('whatever-the-server-adds-next')).toBe(false);
  });
});

describe('PREVIEW_TABS', () => {
  // UX-COMM-04: "with About default". It is also the only tab every privacy mode shows.
  it('starts with About', () => {
    expect(PREVIEW_TABS[0]).toBe('about');
  });

  it('names all five, and each has copy', () => {
    expect([...PREVIEW_TABS]).toEqual(['about', 'posts', 'events', 'groups', 'members']);
    for (const tab of PREVIEW_TABS) expect(PREVIEW_TAB_KEY[tab]).toBeTruthy();
  });
});
