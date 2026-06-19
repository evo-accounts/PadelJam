import { describe, it, expect } from 'vitest';
import { lastMessagePreview } from './chat-preview';

describe('lastMessagePreview', () => {
  it('returns the trimmed text of the most recent message', () => {
    expect(lastMessagePreview([{ id: '1', text: 'older' }, { id: '2', text: '  hi  ' }])).toBe('hi');
  });
  it('labels an image-only message', () => {
    expect(lastMessagePreview([{ id: '1', attachments: [{ type: 'image', image_url: 'u' }] }])).toBe('📷 Photo');
  });
  it('returns empty for a deleted message', () => {
    expect(lastMessagePreview([{ id: '1', type: 'deleted', text: 'gone' }])).toBe('');
  });
  it('returns empty for no messages', () => {
    expect(lastMessagePreview([])).toBe('');
  });
});
