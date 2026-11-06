'use client';

import { useRef, useState } from 'react';
import type { SafeMessage } from '@padel/auth';
import { useT } from '@padel/i18n';
import { passwordValid } from '@padel/utils';
import { PRIVACY_URL, TERMS_URL } from '@/lib/externalUrls';
import type { useAuthFlow } from '@/lib/useAuthFlow';
import { AuthError } from './AuthError';
import { PasswordRules } from './PasswordRules';

type Flow = ReturnType<typeof useAuthFlow>;
type FieldKey = 'fullName' | 'password';

const MISSING: SafeMessage = { ns: 'common', key: 'missingInformation' };
const PASSWORD_WEAK: SafeMessage = { ns: 'auth', key: 'password_weak' };

const inputClass = 'rounded-md border border-input px-3 py-2 aria-invalid:border-destructive';
const linkClass = 'text-primary underline underline-offset-2';

/**
 * Complete your account — the web twin of mobile's create-account (UX-AUTH-05), and it now behaves
 * like it:
 *
 * - CREATE ACCOUNT IS DISABLED until the fields are filled AND the terms box is ticked. That
 *   is mobile's deliberate choice, pinned by 01-auth.e2e.ts, not the validate-on-tap rule the other
 *   forms follow. A disabled button is only acceptable while something says why, so each field
 *   explains itself when it loses focus.
 * - THE CONSENT CHECKBOX. Web had none, while the complete-account Edge Function records
 *   `terms_accepted_at` on the stated premise that the client only reaches it after ticking one —
 *   so every web sign-up was recorded as agreeing to terms it was never shown. The box and the
 *   sentence are SIBLINGS, and the box takes its name from the sentence with `aria-labelledby`:
 *   mobile learned the hard way that a sentence USED AS the label makes a click on "Terms of Use"
 *   toggle the box instead of opening the terms (TermsLine.tsx).
 * - Strength is checked on submit, where it can mark the field; the live checklist shows the rules
 *   before that.
 * - NO SECOND IDENTIFIER. Phone is hidden for launch (PAD-137) and the primary is always an email,
 *   so there is nothing left to ask for. The account is complete once name and password are set.
 */
export function CreateAccountStep({ flow }: { flow: Flow }) {
  const { t } = useT('auth');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, SafeMessage>>>({});
  const passwordRef = useRef<HTMLInputElement>(null);

  const canSubmit = Boolean(fullName.trim()) && Boolean(password) && agreed;

  const mark = (key: FieldKey, message: SafeMessage) => setErrors((prev) => ({ ...prev, [key]: message }));
  const clear = (key: FieldKey) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (flow.busy || !canSubmit) return;
    if (!passwordValid(password)) {
      setErrors({ password: PASSWORD_WEAK });
      passwordRef.current?.focus();
      return;
    }
    setErrors({});
    void flow.completeAccount({ fullName, password });
  };

  // The sentence carries its links as placeholders so a translator can move them; split it the way
  // mobile's TermsLine does rather than rebuilding the sentence here.
  const sentence = t('termsConsentSentence');
  const [before, rest] = sentence.split('{{termsLink}}');
  const [middle, after] = (rest ?? '').split('{{privacyLink}}');

  const fieldError = (key: FieldKey) => {
    const e = errors[key];
    return e ? (
      <span id={`${key}-error`} className="text-sm text-destructive">
        {t(e.key, { ns: e.ns })}
      </span>
    ) : null;
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <h1 className="text-2xl font-semibold">{t('createAccountTitle')}</h1>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('fullNameLabel')}</span>
        <input
          type="text"
          autoComplete="name"
          autoFocus
          className={inputClass}
          placeholder={t('fullNamePlaceholder')}
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            clear('fullName');
          }}
          onBlur={() => {
            if (!fullName.trim()) mark('fullName', MISSING);
          }}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
        />
        {fieldError('fullName')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('passwordLabel')}</span>
        <input
          ref={passwordRef}
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clear('password');
          }}
          onBlur={() => {
            if (!password) mark('password', MISSING);
          }}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error password-rules' : 'password-rules'}
        />
        {fieldError('password')}
      </label>
      {/* Outside the label: a list is not phrasing content. Still described-by the input above. */}
      <PasswordRules value={password} id="password-rules" />

      <div className="flex items-start gap-3 text-sm">
        <input
          id="terms"
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          aria-labelledby="terms-text"
        />
        <p id="terms-text">
          {before}
          <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {t('termsLink')}
          </a>
          {middle}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {t('privacyLink')}
          </a>
          {after}
        </p>
      </div>

      <AuthError error={flow.error} />
      <button
        type="submit"
        disabled={flow.busy || !canSubmit}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {t('createAccount')}
      </button>
    </form>
  );
}
