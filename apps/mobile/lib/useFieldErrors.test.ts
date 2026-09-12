import { describe, expect, it } from 'vitest';
import { dropKey } from './useFieldErrors';

type Key = 'name' | 'rules';

describe('dropKey', () => {
  it('removes the given key and keeps the rest', () => {
    expect(dropKey<Key>({ name: 'required', rules: 'rules_text_required' }, 'name')).toEqual({
      rules: 'rules_text_required',
    });
  });

  it('returns an empty object when the only key is dropped', () => {
    expect(dropKey<Key>({ name: 'required' }, 'name')).toEqual({});
  });

  it('is a no-op when the key was never set', () => {
    const errors: Partial<Record<Key, string>> = { rules: 'rules_text_required' };
    expect(dropKey(errors, 'name')).toEqual(errors);
  });
});
