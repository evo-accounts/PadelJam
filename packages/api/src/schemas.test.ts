import { describe, it, expect } from 'vitest';
import { createCommunitySchema, reviewSchema, postSchema } from './schemas';

describe('schemas', () => {
  it('requires rules text when rules enabled', () => {
    expect(createCommunitySchema.safeParse({ name: 'A', type: 'club', privacy: 'public',
      rules: { enabled: true, text: '' } }).success).toBe(false);
    expect(createCommunitySchema.safeParse({ name: 'A', type: 'club', privacy: 'public',
      rules: { enabled: true, text: 'No-shows banned' } }).success).toBe(true);
  });
  it('rejects an empty community name', () => {
    expect(createCommunitySchema.safeParse({ name: '', type: 'club', privacy: 'public',
      rules: { enabled: false } }).success).toBe(false);
  });
  it('clamps review rating to 1..5', () => {
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 5 }).success).toBe(true);
  });
  it('requires a post to have body or image', () => {
    expect(postSchema.safeParse({ body: '', imagePath: undefined }).success).toBe(false);
    expect(postSchema.safeParse({ body: 'gg', imagePath: undefined }).success).toBe(true);
  });
});
