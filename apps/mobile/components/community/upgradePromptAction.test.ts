import { describe, expect, it } from 'vitest';

import { showSeePlans } from './upgradePromptAction';

describe('showSeePlans', () => {
  it('offers See plans only to a manager while plans are visible', () => {
    expect(showSeePlans(true, true)).toBe(true);
    expect(showSeePlans(false, true)).toBe(false);
    expect(showSeePlans(true, false)).toBe(false);
    expect(showSeePlans(false, false)).toBe(false);
  });
});
