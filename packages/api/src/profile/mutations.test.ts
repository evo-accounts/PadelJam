import { describe, expect, it } from 'vitest';
import { capLocationText } from './mutations';

describe('capLocationText (migration 0157: location_text is at most 200 characters)', () => {
  it('keeps null and short text', () => {
    expect(capLocationText(null)).toBeNull();
    expect(capLocationText('Lisboa')).toBe('Lisboa');
  });
  it('cuts 201 characters to 200', () => {
    expect(Array.from(capLocationText('a'.repeat(201))!)).toHaveLength(200);
  });
  it('keeps an emoji on the boundary whole', () => {
    const out = capLocationText('a'.repeat(199) + '🎾' + 'b')!;
    expect(out).toBe('a'.repeat(199) + '🎾');
  });
});
