import { describe, expect, it } from 'vitest';
import { validateCommunityForm } from './communityFormValidate';

describe('validateCommunityForm', () => {
  it('requires a name', () => {
    expect(validateCommunityForm({ name: '', rulesEnabled: false, rulesText: '' })).toEqual({
      name: 'required',
    });
    expect(validateCommunityForm({ name: '   ', rulesEnabled: false, rulesText: '' })).toEqual({
      name: 'required',
    });
  });

  it('requires rules text only when rules are enabled', () => {
    expect(validateCommunityForm({ name: 'Club', rulesEnabled: false, rulesText: '' })).toEqual({});
    expect(validateCommunityForm({ name: 'Club', rulesEnabled: true, rulesText: '' })).toEqual({
      rules: 'rules_text_required',
    });
  });

  it('passes with a name and, when rules are enabled, non-blank rules text', () => {
    expect(validateCommunityForm({ name: 'Club', rulesEnabled: true, rulesText: 'No smoking.' })).toEqual({});
  });
});
