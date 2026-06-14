import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';

describe('settings query keys', () => {
  it('mySettings shape', () => {
    expect(qk.mySettings('u1')).toEqual(['user-settings', 'u1']);
  });
});
