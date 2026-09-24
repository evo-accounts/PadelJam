'use client';

import { useT } from '@padel/i18n';
import { passwordRules, PASSWORD_RULE_KEYS } from '@padel/utils';

/** The rule keys live in the SHARED common namespace, so mobile and web name them identically. */
const RULE_LABELS: Record<(typeof PASSWORD_RULE_KEYS)[number], string> = {
  minLength: 'ruleMinLength',
  uppercase: 'ruleUppercase',
  number: 'ruleNumber',
  symbol: 'ruleSymbol',
};

/**
 * The live four-rule checklist under a new-password field (UX-GLOB-07) — the same rules mobile's
 * `PasswordField showRules` ticks and GoTrue's `lower_upper_letters_digits_symbols` enforces.
 *
 * Lifted out of the change-password page when create-account needed it too: sign-up showed no rules
 * at all, so web's first password was a guess the server then refused. The checklist says how to
 * satisfy the rule an error names, so a caller keeps it visible while that error shows rather than
 * replacing it. Each row states met/missing in words as well — colour alone would carry it for
 * sighted users only.
 */
export function PasswordRules({ value, id }: { value: string; id?: string }) {
  const { t: tc } = useT('common');
  const rules = passwordRules(value);
  return (
    <ul id={id} className="space-y-1 pt-1">
      {PASSWORD_RULE_KEYS.map((k) => {
        const met = rules[k];
        return (
          <li
            key={k}
            className={`flex items-center gap-2 text-sm ${met ? 'text-success-strong' : 'text-muted-foreground'}`}
          >
            <span aria-hidden>{met ? '●' : '○'}</span>
            <span>{tc(RULE_LABELS[k])}</span>
            <span className="sr-only">{tc(met ? 'ruleMet' : 'ruleMissing')}</span>
          </li>
        );
      })}
    </ul>
  );
}
