import { z } from 'zod';

const appEnv = z.enum(['development', 'staging', 'preview', 'production']);

const optionalUrl = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().url().optional(),
);

export const publicEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  APP_ENV: appEnv.default('development'),
  SENTRY_DSN: optionalUrl,
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_MESSAGE_SERVICE_SID: z.string().optional(),
});

export type PublicEnv = z.output<typeof publicEnvSchema>;
export type ServerEnv = z.output<typeof serverEnvSchema>;

function parseOrThrow<Output, Def extends z.ZodTypeDef, Input>(
  schema: z.ZodType<Output, Def, Input>,
  raw: Record<string, string | undefined>,
): Output {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`[@padel/config] Invalid environment:\n${issues}`);
  }
  return result.data;
}

export const createPublicEnv = (raw: Record<string, string | undefined>): PublicEnv =>
  parseOrThrow(publicEnvSchema, raw);

export const createServerEnv = (raw: Record<string, string | undefined>): ServerEnv =>
  parseOrThrow(serverEnvSchema, raw);
