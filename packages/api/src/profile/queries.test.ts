import { describe, expect, it } from 'vitest';
import { qk } from '../query-keys';
import { ownEmail, ownPhone } from './queries';

describe('profile query keys', () => {
  it('shapes', () => {
    expect(qk.profile('u1')).toEqual(['profile', 'u1']);
    expect(qk.following('u1')).toEqual(['profile', 'u1', 'following']);
    expect(qk.followers('u1')).toEqual(['profile', 'u1', 'followers']);
  });
  it('myProfile key shape', () => {
    expect(qk.myProfile('u1')).toEqual(['profile', 'u1', 'edit']);
  });
});

describe('ownPhone (migration 0115: your own number comes from the auth user)', () => {
  it('restores the leading + that GoTrue drops', () => {
    expect(ownPhone('351912345678')).toBe('+351912345678');
  });
  it('does not double an existing +', () => {
    expect(ownPhone('+351912345678')).toBe('+351912345678');
  });
  it('maps GoTrue\'s empty string and a missing session to null', () => {
    expect(ownPhone('')).toBeNull();
    expect(ownPhone(undefined)).toBeNull();
    expect(ownPhone(null)).toBeNull();
  });
});

describe('ownEmail (migration 0119: your own email comes from the auth user)', () => {
  it('passes a real address through', () => {
    expect(ownEmail('ana@example.com')).toBe('ana@example.com');
  });
  it("maps GoTrue's empty string (phone-only account) and a missing session to null", () => {
    expect(ownEmail('')).toBeNull();
    expect(ownEmail(undefined)).toBeNull();
    expect(ownEmail(null)).toBeNull();
  });
});
