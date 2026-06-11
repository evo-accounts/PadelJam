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
  // 1) Entitlement check (only MVP-scoped features are enforced now).
  if (input.feature && isMvpFeature(input.feature)) {
    const ok =
      input.featureScope === 'account'
        ? await hasAccountFeature(input.client, input.ctx.userId, input.feature as AccountFeatureKey)
        : await hasFeature(input.client, input.communityId ?? '', input.feature as CommunityFeatureKey);
    if (!ok) return { ok: false, reason: 'entitlement', detail: input.feature };
  }

  // 2) Permission check (CASL).
  const ability = abilityFor(input.ctx);
  const ok = input.resource
    ? ability.can(input.action, { __caslSubjectType__: input.subject, ...input.resource } as never)
    : ability.can(input.action, input.subject);
  if (!ok) return { ok: false, reason: 'forbidden' };

  return { ok: true };
}
