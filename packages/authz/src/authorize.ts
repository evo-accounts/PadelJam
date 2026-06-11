import { abilityFor, type Action, type Subject, type AuthContext } from '@padel/permissions';
import {
  hasFeature, hasAccountFeature, isMvpFeature,
  type CommunityFeatureKey, type AccountFeatureKey,
} from '@padel/features';
import type { TypedClient } from '@padel/db';

export interface AuthorizeInput {
  client: TypedClient;
  ctx: AuthContext;
  action: Action;
  subject: Subject;
  resource?: Record<string, unknown>;
  feature?: CommunityFeatureKey | AccountFeatureKey;
  featureScope?: 'community' | 'account';
  communityId?: string;
}

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'entitlement'; detail?: string };

export async function authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
  // 1) Entitlement check. Only MVP feature keys are enforced (isMvpFeature). A non-MVP key is
  // intentionally NOT an entitlement gate yet — it falls through to the permission check until its
  // plan ships (spec 09+). Do NOT rely on authorize() to gate a post-MVP feature.
  if (input.feature && isMvpFeature(input.feature)) {
    const ok =
      input.featureScope === 'account'
        ? await hasAccountFeature(input.client, input.ctx.userId, input.feature as AccountFeatureKey)
        : await hasFeature(input.client, input.communityId ?? '', input.feature as CommunityFeatureKey);
    if (!ok) return { ok: false, reason: 'entitlement', detail: input.feature };
  }

  // 2) Permission check (CASL). IMPORTANT: pass `resource` (e.g. { community_id }) for any
  // community-scoped subject. The resource-less `can(action, subject)` form is SCOPE-BLIND — CASL
  // ignores the `{ community_id }` conditions when checking a bare subject type, so it answers
  // "could this user ever do this in ANY community", not "in THIS one". Callers acting on a specific
  // community MUST supply the resource to get cross-community isolation.
  const ability = abilityFor(input.ctx);
  const ok = input.resource
    ? ability.can(input.action, { __caslSubjectType__: input.subject, ...input.resource } as never)
    : ability.can(input.action, input.subject);
  if (!ok) return { ok: false, reason: 'forbidden' };

  return { ok: true };
}
