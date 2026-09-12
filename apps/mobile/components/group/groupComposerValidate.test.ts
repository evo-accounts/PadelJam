import { describe, expect, it } from 'vitest';

import { validateGroupComposer } from './groupComposerValidate';

describe('validateGroupComposer', () => {
  it('requires a name', () => {
    expect(validateGroupComposer({ name: '' })).toEqual({ name: 'name_required' });
    expect(validateGroupComposer({ name: '   ' })).toEqual({ name: 'name_required' });
  });

  it('passes with a trimmed name', () => {
    expect(validateGroupComposer({ name: 'Sunday Regulars' })).toEqual({});
    expect(validateGroupComposer({ name: '  Padded  ' })).toEqual({});
  });
});
