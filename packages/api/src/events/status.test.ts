import { describe, it, expect } from 'vitest';
import { eventStatusKey } from './status';

const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 60 * 60_000).toISOString();

describe('eventStatusKey', () => {
  it('labels a future scheduled event as upcoming', () => {
    expect(eventStatusKey('scheduled', future)).toBe('statusScheduled');
  });

  it('labels a scheduled event whose start time has passed as starting now', () => {
    expect(eventStatusKey('scheduled', past)).toBe('statusStartingNow');
  });

  it('prefers the explicit status over the clock', () => {
    expect(eventStatusKey('in_progress', past)).toBe('statusInProgress');
    expect(eventStatusKey('in_progress', future)).toBe('statusInProgress');
    expect(eventStatusKey('completed', past)).toBe('statusCompleted');
  });

  it('falls back to scheduled without a usable start time', () => {
    expect(eventStatusKey('scheduled', null)).toBe('statusScheduled');
    expect(eventStatusKey('scheduled', undefined)).toBe('statusScheduled');
    expect(eventStatusKey('scheduled', 'not a date')).toBe('statusScheduled');
  });

  it('leaves any other status on the scheduled badge, as before', () => {
    expect(eventStatusKey('cancelled', future)).toBe('statusScheduled');
  });
});
