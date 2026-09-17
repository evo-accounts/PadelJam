import { describe, expect, it } from 'vitest';

import { actionNeedsAck, previewAction } from './previewAction';

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
