import { describe, expect, it } from 'vitest';

import { dismissCaptions } from './keyboardDismiss';
import type { AxElement } from './a11y';

const el = (
  type: string,
  AXLabel: string | null,
  y: number,
  height: number,
): AxElement => ({
  AXLabel,
  AXUniqueId: null,
  AXValue: null,
  type,
  role: '',
  enabled: true,
  frame: { x: 20, y, width: 360, height },
});

/**
 * Edit profile as the suite actually left it — scrolled, keyboard up, Save
 * behind it. These are the measured frames from the failure artifact of run
 * 35040568107, which is the state the first version of this logic got wrong.
 */
const SCROLLED: AxElement[] = [
  el('Button', 'Maria Santos, Tap to change photo', -34, 102),
  el('Button', 'Close', 70, 44),
  el('Heading', 'Edit profile', 80, 24),
  el('StaticText', 'Name', 91, 20), // under the header — the trap
  el('TextField', 'Name', 116, 42),
  el('StaticText', 'Bio', 175, 20),
  el('StaticText', 'Dominant hand', 488, 16),
  el('Button', 'Left', 512, 58),
  el('Button', 'Right', 512, 58),
  el('Button', 'Save', 782, 52),
];

describe('dismissCaptions', () => {
  it('never offers a caption inside the header', () => {
    const picked = dismissCaptions(SCROLLED, 590);
    expect(picked.map((e) => e.AXLabel)).not.toContain('Name');
  });

  it('offers a caption in the content, below the header and clear of the keyboard', () => {
    const [first] = dismissCaptions(SCROLLED, 590);
    expect(first?.AXLabel).toBe('Bio');
  });

  it('rejects a caption that shares its row with a button', () => {
    // "Dominant hand" sits at y=488..504 and the Left/Right buttons at 512..570,
    // so it does NOT overlap and is a legitimate fallback. Move it onto them and
    // it must drop out.
    const overlapping = SCROLLED.map((e) =>
      e.AXLabel === 'Dominant hand' ? el('StaticText', 'Dominant hand', 520, 16) : e,
    );
    expect(dismissCaptions(overlapping, 590).map((e) => e.AXLabel)).not.toContain('Dominant hand');
  });

  it('offers more than one candidate so a failed tap can be retried', () => {
    expect(dismissCaptions(SCROLLED, 590).length).toBeGreaterThan(1);
  });

  it('offers nothing when every caption is behind the keyboard', () => {
    expect(dismissCaptions(SCROLLED, 150)).toHaveLength(0);
  });
});
