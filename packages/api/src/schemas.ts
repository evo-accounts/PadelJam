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
