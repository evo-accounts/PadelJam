import { describe, expect, it } from 'vitest';

import { blastPlan, validateBlast, whatsappUrl, type BlastDraft } from './blastForm';

const fromTemplate: BlastDraft = {
  source: 'template',
  templateId: 'tpl-1',
  savedId: null,
  title: '  Last call  ',
  description: 'Two spots left.',
  imagePath: null,
};
const fromSaved: BlastDraft = { ...fromTemplate, source: 'saved', savedId: 'sb-1' };

describe('validateBlast', () => {
  it('without customisation only the channels are checked (the template text is fixed)', () => {
    expect(validateBlast({ title: '', description: '' }, ['email'], false)).toEqual({});
    expect(validateBlast({ title: '', description: '' }, [], false)).toEqual({ channels: 'required' });
  });
  it('with customisation, title and message are required and bounded', () => {
    expect(validateBlast({ title: ' ', description: '' }, ['email'], true)).toEqual({ title: 'required', description: 'required' });
    expect(validateBlast({ title: 'x'.repeat(81), description: 'y'.repeat(1001) }, ['whatsapp'], true)).toEqual({
      title: 'too_long',
      description: 'too_long',
    });
  });
});

describe('blastPlan', () => {
  it('a template without customisation sends the template untouched, never saved (B10)', () => {
    const plan = blastPlan(fromTemplate, { custom: false, channels: ['email'], sendTo: 'confirmed', save: true });
    expect(plan).toEqual({
      update: null,
      send: { sourceTemplateId: 'tpl-1', title: null, description: null, imagePath: null, channels: ['email'], sendTo: 'confirmed', save: false },
    });
  });
  it('a customised template sends the trimmed text and saves it when ticked', () => {
    const plan = blastPlan(fromTemplate, { custom: true, channels: ['email', 'whatsapp'], sendTo: 'all', save: true });
    expect(plan.update).toBeNull();
    expect(plan.send).toMatchObject({ sourceTemplateId: 'tpl-1', title: 'Last call', save: true, sendTo: 'all' });
  });
  it('a saved blast updates itself instead of saving a second copy', () => {
    const plan = blastPlan(fromSaved, { custom: true, channels: ['email'], sendTo: 'waiting_list', save: true });
    expect(plan.update).toEqual({ id: 'sb-1', title: 'Last call', description: 'Two spots left.', imagePath: null });
    expect(plan.send.save).toBe(false);
    expect(blastPlan(fromSaved, { custom: true, channels: ['email'], sendTo: 'all', save: false }).update).toBeNull();
  });
});

it('whatsappUrl encodes the share text', () => {
  expect(whatsappUrl('*Hi*\n\nSee you & bring balls')).toBe('https://wa.me/?text=*Hi*%0A%0ASee%20you%20%26%20bring%20balls');
});
