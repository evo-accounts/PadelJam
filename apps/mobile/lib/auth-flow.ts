import { isE164 } from '@padel/utils';

export type IdentifierKind = 'email' | 'phone';

export const detectKind = (value: string): IdentifierKind =>
  isE164(value.trim()) ? 'phone' : 'email';

/**
 * Tiny module-level store carrying the OTP target (identifier + channel) across
 * the (auth) screens. Kept out of React state so it survives route transitions
 * without prop-drilling or serialising secrets through URL params.
 */
type AuthFlowState = {
  identifier: string;
  kind: IdentifierKind;
};

let state: AuthFlowState = { identifier: '', kind: 'email' };

export const setAuthTarget = (identifier: string, kind: IdentifierKind): void => {
  state = { identifier, kind };
};

export const getAuthTarget = (): AuthFlowState => state;

export const clearAuthTarget = (): void => {
  state = { identifier: '', kind: 'email' };
};
