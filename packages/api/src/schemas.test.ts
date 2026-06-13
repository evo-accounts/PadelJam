import { describe, it, expect } from 'vitest';
import {
  createCommunitySchema,
  reviewSchema,
  postSchema,
  createEventSchema,
  buildCreateEventPayload,
  type CreateEventInput,
} from './schemas';

const baseEvent: CreateEventInput = {
  groupId: '11111111-1111-1111-1111-111111111111',
  eventType: 'americano',
  specification: 'classic',
  scoringMode: 'points',
  scoringValue: 24,
  hasLocation: false,
  numCourts: 2,
  startsAt: '2026-07-01T18:00:00.000Z',
  durationMinutes: 90,
  allowStandby: false,
  isPrivate: false,
  entranceFee: { enabled: false },
  playersSubmitResults: true,
  organizerRole: 'organizing_and_playing',
  name: 'Friday Americano',
};

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

describe('createEventSchema', () => {
  it('accepts a valid group event', () => {
    expect(createEventSchema.safeParse(baseEvent).success).toBe(true);
  });
  it('forces a standalone event to be private', () => {
    expect(
      createEventSchema.safeParse({ ...baseEvent, groupId: null, isPrivate: false }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...baseEvent, groupId: null, isPrivate: true }).success,
    ).toBe(true);
  });
  it('requires amount + method when the fee is enabled', () => {
    expect(
      createEventSchema.safeParse({ ...baseEvent, entranceFee: { enabled: true } }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        entranceFee: { enabled: true, amount: 5, method: 'cash' },
      }).success,
    ).toBe(true);
  });
  it('rejects an empty name', () => {
    expect(createEventSchema.safeParse({ ...baseEvent, name: '' }).success).toBe(false);
  });
});

describe('buildCreateEventPayload', () => {
  it('maps camelCase input to the snake_case RPC payload', () => {
    const payload = buildCreateEventPayload({
      ...baseEvent,
      entranceFee: { enabled: true, amount: 5, method: 'mba', mbaNumber: '900111222' },
      series: { dayOfWeek: 5, startTime: '18:00', durationMinutes: 90, inviteLeadDays: 5 },
      invitees: [{ invitee_id: '22222222-2222-2222-2222-222222222222' }],
      courtIds: ['33333333-3333-3333-3333-333333333333'],
    });
    expect(payload).toMatchObject({
      group_id: baseEvent.groupId,
      event_type: 'americano',
      scoring_mode: 'points',
      num_courts: 2,
      starts_at: baseEvent.startsAt,
      duration_minutes: 90,
      entrance_fee_enabled: true,
      entrance_fee_amount: 5,
      entrance_fee_method: 'mba',
      entrance_fee_mba_number: '900111222',
      name: 'Friday Americano',
      series: { day_of_week: 5, start_time: '18:00', duration_minutes: 90, invite_lead_days: 5 },
      court_ids: ['33333333-3333-3333-3333-333333333333'],
    });
  });
});
