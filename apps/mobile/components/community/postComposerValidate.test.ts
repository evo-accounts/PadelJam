import { describe, expect, it } from 'vitest';

import { validatePostComposer } from './postComposerValidate';

describe('validatePostComposer', () => {
  it('requires a body when there is no image', () => {
    expect(validatePostComposer({ body: '', hasImage: false })).toEqual({ body: 'post_empty' });
    expect(validatePostComposer({ body: '   ', hasImage: false })).toEqual({ body: 'post_empty' });
  });

  it('passes with a body', () => {
    expect(validatePostComposer({ body: 'Great session today!', hasImage: false })).toEqual({});
  });

  it('passes with only an image', () => {
    expect(validatePostComposer({ body: '', hasImage: true })).toEqual({});
  });
});
