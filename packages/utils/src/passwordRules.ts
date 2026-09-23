/** UX-GLOB-07. Mirrors GoTrue's `lower_upper_letters_digits_symbols` and the complete-account function. */
export type PasswordRuleKey = 'minLength' | 'uppercase' | 'number' | 'symbol';
export const PASSWORD_RULE_KEYS: PasswordRuleKey[] = ['minLength', 'uppercase', 'number', 'symbol'];

export function passwordRules(value: string): Record<PasswordRuleKey, boolean> {
  return {
    minLength: value.length >= 8,
    uppercase: /\p{Lu}/u.test(value),
    number: /\d/.test(value),
    symbol: /[^\p{L}\p{N}]/u.test(value),
  };
}

export function passwordValid(value: string): boolean {
  return Object.values(passwordRules(value)).every(Boolean);
}
