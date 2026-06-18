import { z } from 'zod';

export const COMMUNITY_TYPES = ['club', 'team', 'friends'] as const;
export const PRIVACY = ['public', 'request_to_join', 'private'] as const;

export const createCommunitySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional(),
    location: z.string().trim().max(120).optional(),
    type: z.enum(COMMUNITY_TYPES),
    privacy: z.enum(PRIVACY),
    thumbnailPath: z.string().optional(),
    coverImagePath: z.string().optional(),
    rules: z.object({ enabled: z.boolean(), text: z.string().trim().optional() }),
  })
  .refine((v) => !v.rules.enabled || (v.rules.text?.length ?? 0) > 0, {
    path: ['rules', 'text'],
    message: 'rules_text_required',
  });
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;

export const GROUP_PRIVACIES = ['public', 'private'] as const;

export const createGroupSchema = z.object({
  communityId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  isPrivate: z.boolean().default(false),
  thumbnailPath: z.string().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema.partial().omit({ communityId: true });
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const postSchema = z
  .object({ body: z.string().trim().max(4000).optional(), imagePath: z.string().optional() })
  .refine((v) => (v.body?.length ?? 0) > 0 || !!v.imagePath, { message: 'post_empty' });
export type PostInput = z.infer<typeof postSchema>;

export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EVENT_TYPES = ['americano', 'mexicano', 'up_and_down'] as const;
export const SPECIFICATIONS = ['classic', 'mixed', 'team'] as const;
export const SCORING_MODES = ['points', 'time', 'classic'] as const;
export const ORGANIZER_ROLES = ['organizing_only', 'organizing_and_playing'] as const;
export const ENTRANCE_FEE_METHODS = ['cash', 'at_club', 'mba'] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type Specification = (typeof SPECIFICATIONS)[number];
export type ScoringMode = (typeof SCORING_MODES)[number];
export type OrganizerRole = (typeof ORGANIZER_ROLES)[number];
export type EntranceFeeMethod = (typeof ENTRANCE_FEE_METHODS)[number];

const inviteeSchema = z.object({
  invitee_id: z.string().uuid().optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
});

const seriesSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'invalid_time'),
  durationMinutes: z.number().int().positive(),
  inviteLeadDays: z.union([z.literal(3), z.literal(5), z.literal(7)]),
});

export const createEventSchema = z
  .object({
    groupId: z.string().uuid().nullable(),
    eventType: z.enum(EVENT_TYPES),
    specification: z.enum(SPECIFICATIONS),
    scoringMode: z.enum(SCORING_MODES),
    scoringValue: z.number().int().nullable(),
    manualLocationName: z.string().trim().optional(),
    manualLocationAddress: z.string().trim().optional(),
    venueId: z.string().uuid().optional(),
    locationLat: z.number().optional(),
    locationLng: z.number().optional(),
    hasLocation: z.boolean(),
    numCourts: z.number().int().min(1),
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().positive(),
    allowStandby: z.boolean(),
    standbySpots: z.number().int().optional(),
    isPrivate: z.boolean(),
    entranceFee: z.object({
      enabled: z.boolean(),
      amount: z.number().optional(),
      method: z.enum(ENTRANCE_FEE_METHODS).optional(),
      mbaNumber: z.string().trim().optional(),
    }),
    playersSubmitResults: z.boolean(),
    organizerRole: z.enum(ORGANIZER_ROLES),
    name: z.string().trim().min(1, 'name_required').max(80),
    description: z.string().trim().max(500).optional(),
    thumbnailPath: z.string().optional(),
    series: seriesSchema.optional(),
    invitees: z.array(inviteeSchema).optional(),
    courtIds: z.array(z.string().uuid()).optional(),
  })
  // A standalone event (no group) must be private.
  .refine((v) => v.groupId !== null || v.isPrivate, {
    path: ['isPrivate'],
    message: 'standalone_must_be_private',
  })
  // When the fee is enabled, an amount and a method are required.
  .refine((v) => !v.entranceFee.enabled || (v.entranceFee.amount != null && !!v.entranceFee.method), {
    path: ['entranceFee'],
    message: 'fee_requires_amount_and_method',
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Map the camelCase wizard output to the snake_case jsonb the `create_event`
 * RPC expects as `p_payload`. Keys are omitted when undefined so the RPC can
 * apply its own defaults; nullable fields are passed through as-is.
 */
export function buildCreateEventPayload(input: CreateEventInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    group_id: input.groupId,
    event_type: input.eventType,
    specification: input.specification,
    scoring_mode: input.scoringMode,
    scoring_value: input.scoringValue,
    num_courts: input.numCourts,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    allow_standby: input.allowStandby,
    standby_spots: input.standbySpots ?? null,
    is_private: input.isPrivate,
    entrance_fee_enabled: input.entranceFee.enabled,
    entrance_fee_amount: input.entranceFee.amount ?? null,
    entrance_fee_method: input.entranceFee.method ?? null,
    entrance_fee_mba_number: input.entranceFee.mbaNumber ?? null,
    players_submit_results: input.playersSubmitResults,
    organizer_role: input.organizerRole,
    name: input.name,
    description: input.description ?? null,
    thumbnail_path: input.thumbnailPath ?? null,
    // events_venue_xor_manual CHECK: venue_id XOR manual_location_name. When a venue is picked,
    // null the manual fields (the venue name still flows to location_text, which is not XOR-bound).
    manual_location_name: input.venueId ? null : (input.manualLocationName ?? null),
    manual_location_address: input.venueId ? null : (input.manualLocationAddress ?? null),
    venue_id: input.venueId ?? null,
    location_lat: input.locationLat ?? null,
    location_lng: input.locationLng ?? null,
    location_text: input.manualLocationName ?? null,
    has_location: input.hasLocation,
  };
  if (input.series) {
    payload.series = {
      day_of_week: input.series.dayOfWeek,
      start_time: input.series.startTime,
      duration_minutes: input.series.durationMinutes,
      invite_lead_days: input.series.inviteLeadDays,
    };
  }
  if (input.invitees) payload.invitees = input.invitees;
  if (input.courtIds) payload.court_ids = input.courtIds;
  return payload;
}

/**
 * The editable subset of an event (JM-24). event_type/specification/num_courts/
 * location/group_id/series are immutable and never sent to `update_event`.
 */
export const updateEventSchema = z
  .object({
    name: z.string().trim().min(1, 'name_required').max(80),
    description: z.string().trim().max(500).optional(),
    thumbnailPath: z.string().optional(),
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().positive(),
    scoringMode: z.enum(SCORING_MODES),
    scoringValue: z.number().int().nullable(),
    allowStandby: z.boolean(),
    standbySpots: z.number().int().optional(),
    isPrivate: z.boolean(),
    entranceFee: z.object({
      enabled: z.boolean(),
      amount: z.number().optional(),
      method: z.enum(ENTRANCE_FEE_METHODS).optional(),
      mbaNumber: z.string().trim().optional(),
    }),
    playersSubmitResults: z.boolean(),
    organizerRole: z.enum(ORGANIZER_ROLES),
  })
  .refine((v) => !v.entranceFee.enabled || (v.entranceFee.amount != null && !!v.entranceFee.method), {
    path: ['entranceFee'],
    message: 'fee_requires_amount_and_method',
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export function buildUpdateEventPayload(input: UpdateEventInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? null,
    thumbnail_path: input.thumbnailPath ?? null,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    scoring_mode: input.scoringMode,
    scoring_value: input.scoringValue,
    allow_standby: input.allowStandby,
    standby_spots: input.standbySpots ?? null,
    is_private: input.isPrivate,
    entrance_fee_enabled: input.entranceFee.enabled,
    entrance_fee_amount: input.entranceFee.amount ?? null,
    entrance_fee_method: input.entranceFee.method ?? null,
    entrance_fee_mba_number: input.entranceFee.mbaNumber ?? null,
    players_submit_results: input.playersSubmitResults,
    organizer_role: input.organizerRole,
  };
}

export const submitScoreSchema = z.object({
  sideA: z.number().int().min(0),
  sideB: z.number().int().min(0),
  notPlayed: z.boolean().default(false),
});
export type SubmitScoreInput = z.infer<typeof submitScoreSchema>;

// ---------------------------------------------------------------------------
// Blasts
// ---------------------------------------------------------------------------

export const BLAST_CHANNELS = ['email', 'whatsapp'] as const;
export const blastSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  channels: z.array(z.enum(BLAST_CHANNELS)).min(1),
});
export type BlastInput = z.infer<typeof blastSchema>;
