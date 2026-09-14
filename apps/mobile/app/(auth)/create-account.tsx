/**
 * Complete your account (UX-AUTH-05).
 *
 * The screen already collected the right things; what the audit asked for was
 * the ORDER, the primitives, and a submit that cannot be pressed before the
 * form is answerable:
 *
 *   - the fields now run name -> the missing identifier -> password -> terms ->
 *     the primary action, instead of opening with a disabled box holding an
 *     address the user did not type.
 *   - the 22pt hand-rolled tick is the `Checkbox` primitive, with a testID. That
 *     was half a fix for a while: the consent SENTENCE was the checkbox's label,
 *     so the id named a row whose centre was the "Terms of Use" link, and the
 *     E2E had to aim at the row's leading edge to avoid opening Safari. Worse
 *     than an awkward test — iOS aggregates a Pressable and its descendants into
 *     one accessibility element, so VoiceOver could not reach either link and a
 *     screen-reader user was asked to accept documents they could not open. The
 *     box and the sentence are SIBLINGS now (see the consent row below), so the
 *     id names the square and nothing else, and `tap({id})` is safe.
 *   - the raw phone `TextInput` is `PhoneField`. That deletes this screen's own
 *     E.164 guard along with it: the field reports a valid E.164 or nothing, so
 *     there is no longer a local-format number to catch.
 *   - the six-digit box in the verify phase (a `TextInput` with
 *     `letterSpacing: 8`) is `CodeField`, the same one otp.tsx and recovery.tsx
 *     use.
 *   - CREATE ACCOUNT IS DISABLED until the required fields are filled and the
 *     box is ticked. Paired with per-field errors on blur, deliberately: a
 *     disabled control that never says why is the failure mode UX-GLOB-06 is
 *     about, and "filled" is a question every one of these fields can answer
 *     the moment it loses focus.
 *   - the three exits hard-coded '/(onboarding)/location'. They go through
 *     `resolvePostAuthRoute()` now. For a brand-new account that resolves to
 *     the same first step, so this is correctness rather than a visible change
 *     — it stops being a lie the day onboarding gains a step before location.
 *
 * WHICH IDENTIFIER IS MISSING IS DERIVED FROM THE SESSION, NOT FROM THE
 * AUTH-FLOW SINGLETON. `getAuthTarget()` is module state: it does not survive a
 * process restart, and this route is one expo-router will happily restore after
 * one — a user who verified a code, landed here and killed the app comes back
 * to an EMPTY singleton, whose `kind` defaults to 'email' and would therefore
 * ask a phone-verified user for their phone number again. The session is the
 * durable record of what was actually verified, so it is read first and the
 * singleton is only the fallback for the case the session cannot decide.
 */
import {
  primaryCredential,
  signInWithPassword,
  startEmailChange,
  startPhoneChange,
  useSession,
  verifyEmailChange,
  verifyPhoneChange,
} from '@padel/auth';
import { useT } from '@padel/i18n';
import { formatDisplayName } from '@padel/utils';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsLine, useTermsConsentLabel } from '@/components/auth/TermsLine';
import { safeAuthMessage } from '@/lib/authErrors';
import { getAuthTarget, type IdentifierKind } from '@/lib/auth-flow';
import { formatE164ForDisplay } from '@/lib/countries';
import { passwordValid } from '@/lib/passwordRules';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { useOtpCountdown } from '@/lib/useOtpCountdown';
import { colors, space } from '../../theme';
import {
  Button,
  Checkbox,
  CodeField,
  Field,
  Loading,
  PasswordField,
  PhoneField,
  Screen,
  Text,
  TopBar,
  useBanner,
} from '../../components/ui';

/**
 * Shape only — the same call sign-in.tsx makes and for the same reason:
 * anything stricter rejects addresses that exist (plus-tags, new TLDs, quoted
 * locals), and the server is the real authority. This is here to catch a typo
 * before a rate-limit slot is spent on it.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_LENGTH = 6;

type FieldKey = 'fullName' | 'secondary' | 'password';

/** GoTrue stores the phone WITHOUT a leading '+'; everything else here is E.164. */
const toE164 = (phone: string | null | undefined): string =>
  phone ? (phone.startsWith('+') ? phone : `+${phone}`) : '';

export default function CreateAccountScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { kind } = getAuthTarget();
  const termsConsentLabel = useTermsConsentLabel();
  const { session, loading: sessionLoading } = useSession();

  const sessionEmail = session?.user?.email ?? '';
  const sessionPhone = toE164(session?.user?.phone);
  const socialName =
    (session?.user?.user_metadata?.full_name as string | undefined) ??
    (session?.user?.user_metadata?.name as string | undefined) ??
    '';

  /**
   * The verified identifier, and therefore the one NOT to ask for. A session
   * that carries exactly one of the two answers the question outright — that is
   * every OTP sign-up and every social sign-up (which arrives with a verified
   * email and no phone). Only a session carrying both, or neither, falls back
   * to the singleton, and a restored route with an empty singleton then lands
   * on its 'email' default, which is the pre-existing behaviour rather than a
   * new guess.
   */
  const primaryKind: IdentifierKind =
    sessionEmail && !sessionPhone ? 'email' : sessionPhone && !sessionEmail ? 'phone' : kind;
  const secondaryKind: IdentifierKind = primaryKind === 'phone' ? 'email' : 'phone';
  const primaryIdentifier = primaryKind === 'phone' ? sessionPhone : sessionEmail;

  const [phase, setPhase] = useState<'form' | 'verify'>('form');
  /**
   * `null` until the user types, so the social prefill can still appear when
   * the session lands AFTER mount — `useState(socialName)` snapshots '' in that
   * race and never recovers, and seeding it from an effect is the
   * set-state-in-effect pattern the ESLint config warns about.
   */
  const [typedName, setTypedName] = useState<string | null>(null);
  const fullName = typedName ?? socialName;
  /** E.164 or '' for a phone (PhoneField's contract); the trimmed address for an email. */
  const [secondary, setSecondary] = useState('');
  /** National digits typed so far. The only way to tell "half a number" from "nothing". */
  const [phoneDigits, setPhoneDigits] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** `CodeField`'s `key`: bumping it remounts the boxes empty and refocuses them. */
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const { errors, setErrors, clear } = useFieldErrors<FieldKey>();

  /** Resend cooldown for the secondary-identifier OTP (verify phase). */
  const { state: otpState, dispatch, remaining } = useOtpCountdown();

  const name = fullName.trim();
  const secondaryValue = secondary.trim();

  /**
   * UX-AUTH-05: the primary action is dead until the form is answerable.
   * "Filled", not "valid" — the password's four rules are already spelled out
   * live under the input by `PasswordField`, so gating on them would disable the
   * button for a reason the user is being shown but has not finished acting on.
   * Strength is checked on submit instead, where it can redden the field.
   */
  const canSubmit = Boolean(name) && Boolean(secondaryValue) && Boolean(password) && agreed;

  const goNext = async () => {
    router.replace((await resolvePostAuthRoute()) as never);
  };

  // GoTrue rejects a change to an identifier already registered on auth.users (the profiles
  // pre-check in complete-account can't see auth-only users) — reuse the "taken" copy for those.
  const startChangeErrorKey = (err: { code?: string } | null): string => {
    if (err?.code === 'email_exists') return 'email_taken';
    if (err?.code === 'phone_exists') return 'phone_taken';
    return 'sendCodeFailed';
  };

  const startSecondaryChange = async (): Promise<'sent' | 'applied' | 'failed'> => {
    const { data, error: changeErr } =
      secondaryKind === 'phone'
        ? await startPhoneChange(supabase, secondaryValue)
        : await startEmailChange(supabase, secondaryValue);
    if (changeErr) {
      banner.show(t(startChangeErrorKey(changeErr)));
      return 'failed';
    }
    // If the server has confirmations disabled, GoTrue applies the change immediately (the
    // returned user already carries the new identifier — phone in GoTrue format, no '+').
    // There is no code in flight, so showing the verify step would dead-end.
    const applied =
      secondaryKind === 'phone'
        ? data.user?.phone === secondaryValue.replace(/^\+/, '')
        : data.user?.email?.toLowerCase() === secondaryValue.toLowerCase();
    if (applied) return 'applied';
    dispatch({ type: 'sent', at: Date.now() });
    return 'sent';
  };

  /** Blur validation, one field at a time — what keeps a disabled submit explained. */
  const blurName = () => {
    setErrors((prev) => (name ? prev : { ...prev, fullName: tc('missingInformation') }));
  };

  const blurSecondary = () => {
    setErrors((prev) => {
      if (secondaryKind === 'phone') {
        // '' with digits typed is an INCOMPLETE number, not an empty field —
        // PhoneField only emits a value once it is valid for the region.
        if (secondaryValue) return prev;
        return { ...prev, secondary: phoneDigits ? t('invalid_phone') : tc('missingInformation') };
      }
      if (EMAIL_SHAPE.test(secondaryValue)) return prev;
      return { ...prev, secondary: tc('missingInformation') };
    });
  };

  const blurPassword = () => {
    setErrors((prev) => (password ? prev : { ...prev, password: tc('missingInformation') }));
  };

  const submit = async () => {
    if (busy || !canSubmit) return;
    // UX-GLOB-06: redden the field AND banner it, in the identical words.
    if (!passwordValid(password)) {
      setErrors({ password: t('password_weak') });
      banner.show(t('password_weak'));
      return;
    }
    if (secondaryKind === 'email' && !EMAIL_SHAPE.test(secondaryValue)) {
      setErrors({ secondary: tc('missingInformation') });
      banner.show(tc('missingInformation'));
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const {
        data: { session: live },
      } = await supabase.auth.getSession();
      if (!live) {
        banner.show(tc('somethingWrong'));
        return;
      }

      const secondaryBody =
        secondaryKind === 'phone' ? { phone: secondaryValue } : { email: secondaryValue };

      // The Edge Function sets the password AND creates the profiles row server-side from the
      // identifiers persisted on auth.users — the client never writes its own identity into the
      // globally-readable profiles table. The secondary identifier goes along only for the fast
      // already-taken pre-check; it is attached below via the VERIFIED change flow, never here.
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/complete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${live.access_token}`,
        },
        body: JSON.stringify({ ...secondaryBody, password, full_name: formatDisplayName(name) }),
      });

      if (!resp.ok) {
        let errorCode: string | undefined;
        try {
          const body = (await resp.json()) as { error?: string };
          errorCode = body.error;
        } catch {
          // Non-JSON error body — fall through to the generic failure code below.
        }
        // Dev console gets the full detail; the UI copy may collapse it.
        console.warn('[complete-account] failed:', resp.status, errorCode ?? '(no error code in body)');
        if (errorCode === 'email_taken' || errorCode === 'phone_taken' || errorCode === 'invalid_phone') {
          setErrors({ secondary: t(errorCode) });
          banner.show(t(errorCode));
        } else if (errorCode === 'password_weak') {
          setErrors({ password: t(errorCode) });
          banner.show(t(errorCode));
        } else {
          banner.show(tc('somethingWrong'));
        }
        return;
      }

      // complete-account sets a password via the admin API, which rotates the OTP-issued refresh
      // token — the current session would be signed out at the next refresh, mid-onboarding. Mint a
      // fresh, durable session with the password we just set, using the primary verified identifier.
      const cred = primaryCredential({
        primaryKind,
        email: live.user.email,
        phone: live.user.phone,
      });
      if (cred) {
        const { error: signInErr } = await signInWithPassword(supabase, cred.identifier, cred.kind, password);
        if (signInErr) {
          banner.show(tc('somethingWrong'));
          router.replace('/(auth)/sign-in');
          return;
        }
      }

      // Verify the secondary identifier as the signed-in user: updateUser sends the OTP, the
      // verify phase collects it. Enter the phase even when the send fails — the account already
      // exists, so the user retries (resend) or skips from there instead of resubmitting the form.
      if ((await startSecondaryChange()) === 'applied') {
        await goNext();
        return;
      }
      setPhase('verify');
    } finally {
      setBusy(false);
    }
  };

  const verifySecondary = async () => {
    if (busy) return;
    if (otpState.locked) { banner.show(t('locked')); return; }
    if (code.length < CODE_LENGTH) { banner.show(tc('missingInformation')); return; }
    setBusy(true);
    try {
      const { error: verifyError } =
        secondaryKind === 'phone'
          ? await verifyPhoneChange(supabase, secondaryValue, code)
          : await verifyEmailChange(supabase, secondaryValue, code);
      if (verifyError) {
        dispatch({ type: 'fail' });
        const { ns, key } = safeAuthMessage(verifyError);
        const message = t(key, { ns });
        // Both halves (UX-GLOB-06): the boxes redden AND the banner shows, in
        // the identical words. Only wipe the digits when the CODE is what
        // failed — a network blip says nothing about them.
        setCodeError(message);
        banner.show(message);
        if (key === 'invalidCode') {
          setCode('');
          setAttempt((n) => n + 1);
        }
        return;
      }
      await goNext();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || remaining > 0) return;
    setBusy(true);
    try {
      if ((await startSecondaryChange()) === 'applied') {
        await goNext();
        return;
      }
      setCodeError(null);
      setCode('');
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  // The secondary is optional (profiles.email/phone are nullable): skipping leaves the profile
  // with just the verified primary; the user can add the other identifier later in settings.
  const skip = () => {
    if (busy) return;
    void goNext();
  };

  /**
   * Which field this screen shows is derived from the SESSION (see the
   * docblock), so rendering before it has loaded would put up the wrong input
   * and swap it underneath the user a moment later — carrying whatever they had
   * already typed into a box that means something else.
   */
  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar variant="nav" />
        <Loading testID="create-account-loading" />
      </SafeAreaView>
    );
  }

  if (phase === 'verify') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Back is the FORM, not a route: the account already exists by now, so
            leaving the app would be wrong and there is nothing behind this in
            the stack either. Explicit target throughout (auth) — useGoBack()'s
            '/' fallback drops a signed-out user on the splash. */}
        <TopBar variant="nav" onBack={() => setPhase('form')} />
        <Screen style={styles.body}>
          <Text variant="title">
            {secondaryKind === 'phone' ? t('verifyPhoneTitle') : t('verifyEmailTitle')}
          </Text>
          <Text variant="body" tone="muted" style={styles.help}>
            {t('otpHelp', {
              identifier:
                secondaryKind === 'phone' ? formatE164ForDisplay(secondaryValue) : secondaryValue,
            })}
          </Text>

          <CodeField
            key={attempt}
            label={t('otpLabel')}
            value={code}
            onChangeText={(next) => { setCode(next); if (codeError) setCodeError(null); }}
            error={codeError}
            // iOS reads an emailed code out of Mail too; Android's SMS retriever
            // must not be armed for a code that will never arrive as a message.
            autofill={secondaryKind === 'phone' ? 'sms' : 'email'}
            editable={!busy && !otpState.locked}
            autoFocus
            testID="create-account-code"
          />

          {/* Directly below the input and ABOVE the primary action — the same
              order otp.tsx and recovery.tsx settled on. */}
          <Button
            label={remaining > 0 ? t('cooldown', { seconds: remaining }) : t('resend')}
            variant="ghost"
            disabled={busy || remaining > 0}
            onPress={resend}
            fullWidth
            style={styles.resend}
            testID="create-account-resend"
          />

          <Button
            label={t('verify')}
            fullWidth
            loading={busy}
            onPress={verifySecondary}
            style={styles.verifyCta}
            testID="create-account-verify"
          />

          <Button
            label={t('skipForNow')}
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={skip}
            style={styles.another}
            testID="create-account-skip"
          />
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Back ABANDONS the sign-up. The identifier is verified and an auth user
          exists, but there is no profile yet, so leaving the session live would
          have Boot route straight back here on the next launch with no way out.
          A local sign-out (not global — other devices are not this screen's
          business) returns the user to sign-in, from where the same identifier
          walks back in. Explicit target, never useGoBack(): its '/' fallback
          strands a signed-out user on the splash. */}
      <TopBar
        variant="nav"
        onBack={() => {
          void supabase.auth.signOut({ scope: 'local' }).finally(() => {
            router.replace('/(auth)/sign-in');
          });
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen scroll style={styles.body}>
          <Text variant="title">{t('createAccountTitle')}</Text>
          <Text variant="body" tone="muted" style={styles.help}>
            {t('createAccountHelp', {
              identifier:
                primaryKind === 'phone' ? formatE164ForDisplay(primaryIdentifier) : primaryIdentifier,
            })}
          </Text>

          <Field
            label={t('fullNameLabel')}
            value={fullName}
            onChangeText={(v) => { setTypedName(v); clear('fullName'); }}
            onBlur={blurName}
            error={errors.fullName ?? null}
            placeholder={t('fullNamePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            editable={!busy}
            testID="create-account-name"
          />

          {secondaryKind === 'phone' ? (
            <PhoneField
              label={t('secondaryPhoneLabel')}
              value={secondary}
              onChangeValue={(e164, meta) => {
                setSecondary(e164);
                setPhoneDigits(meta.national);
                clear('secondary');
              }}
              onBlur={blurSecondary}
              error={errors.secondary ?? null}
              editable={!busy}
              containerStyle={styles.field}
              testID="create-account-phone"
            />
          ) : (
            <Field
              label={t('secondaryEmailLabel')}
              value={secondary}
              onChangeText={(v) => { setSecondary(v); clear('secondary'); }}
              onBlur={blurSecondary}
              error={errors.secondary ?? null}
              placeholder={t('secondaryEmailPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              autoComplete="email"
              editable={!busy}
              containerStyle={styles.field}
              testID="create-account-email"
            />
          )}

          <PasswordField
            label={t('passwordLabel')}
            value={password}
            onChangeText={(v) => { setPassword(v); clear('password'); }}
            onBlur={blurPassword}
            error={errors.password ?? null}
            showRules
            editable={!busy}
            containerStyle={styles.field}
            testID="password-input"
          />

          {/* SIBLINGS, not a pressable wrapping both — ONLY THE SQUARE TOGGLES
              CONSENT. The sentence used to be the checkbox's label, which put
              two links inside a Pressable; iOS then aggregated the lot into one
              accessibility element and VoiceOver could reach neither document
              the user was being asked to accept. Splitting them costs the
              "tap anywhere on the row" affordance, which is the trade this
              takes deliberately: the box keeps a 44pt target via the
              primitive's hitSlop, and the links become real, individually
              focusable links exactly as they already are on sign-in.

              The box therefore has no text to borrow a name from, hence the
              explicit accessibilityLabel — it must still announce WHAT is being
              agreed to, not just "checkbox". */}
          <View style={styles.terms}>
            <Checkbox
              checked={agreed}
              onChange={setAgreed}
              accessibilityLabel={termsConsentLabel}
              testID="create-account-terms"
            />
            <TermsLine copy="consent" style={styles.termsText} testID="create-account-terms-text" />
          </View>

          <Button
            label={t('createAccount')}
            fullWidth
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.cta}
            testID="create-account-submit"
          />
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { paddingTop: space[6], paddingBottom: space[6] },
  help: { marginTop: space[2], marginBottom: space[6] },
  field: { marginTop: space[4] },
  // `flex-start` and the same gap the Checkbox row itself used, so the square
  // still sits against the sentence's first line when it wraps.
  terms: { marginTop: space[5], flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  termsText: { flex: 1 },
  resend: { marginTop: space[1] },
  verifyCta: { marginTop: space[3] },
  cta: { marginTop: space[5] },
  another: { marginTop: space[3] },
});
