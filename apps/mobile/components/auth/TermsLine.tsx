/**
 * TermsLine — the "Terms of Use and Privacy Policy" sentence, in the two
 * wordings this app needs.
 *
 * Extracted because it is rendered on more than one screen (sign-in, and the
 * consent copy on create-account), and each copy re-split the interpolated
 * string and re-declared the two URLs. A sentence with tappable spans inside it
 * cannot be assembled by a call site without also re-deriving the styling of
 * those spans, which is how the three existing copies drifted apart.
 *
 * WHY IT TAKES A `copy` PROP RATHER THAN THE CALL SITE REBUILDING THE SENTENCE.
 * create-account's consent checkbox says the same thing in the first person
 * ("I agree to the …" rather than "By continuing, you agree to our …"), so it
 * used to hand-roll its own three-run sentence from `termsAgreePrefix` /
 * `termsAnd` — sharing only the URLs. That second copy is what drifted: it sat
 * INSIDE a Pressable, where iOS aggregates a view and its descendants into one
 * accessibility element, so neither link was reachable by VoiceOver. One
 * component owning both wordings is what stops a third copy appearing with a
 * third set of a11y properties.
 *
 * The URLs live here rather than in a config module because they are the same
 * two constants `profile/settings.tsx` already hardcodes; centralising them is a
 * separate change and would otherwise be the only reason this file imports
 * anything.
 */
import { useT } from '@padel/i18n';
import { Linking, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '../ui';

/**
 * Still exported, though nothing imports them today: create-account used to,
 * and now renders this component instead. `profile/settings.tsx` keeps its own
 * pair of identical constants, and adopting these is the obvious next step —
 * un-exporting now would only make that step larger. Anything that needs the
 * SENTENCE should render the component, not rebuild it from these.
 */
export const TERMS_URL = 'https://padeljam.app/terms';
export const PRIVACY_URL = 'https://padeljam.app/privacy';

type Props = {
  /**
   * Which wording. `disclosure` (default) is sign-in's passive notice that
   * continuing implies agreement; `consent` is the first-person sentence that
   * labels create-account's consent checkbox, where agreeing is a deliberate
   * act the user performs by ticking a box.
   */
  copy?: 'disclosure' | 'consent';
  style?: StyleProp<TextStyle>;
  testID?: string;
};

export function TermsLine({ copy = 'disclosure', style, testID }: Props) {
  const { t } = useT('auth');
  const consent = copy === 'consent';
  // Literal keys on both branches, deliberately: scripts/check-i18n-keys.mjs
  // only validates literals, so `t(someVariable)` would silently skip the check
  // that stopped a raw key reaching the screen twice before.
  const sentence = consent ? t('termsConsentSentence') : t('socialTermsDisclosure');
  // `caption` beside a 22pt checkbox, `hint` under a column of buttons — the
  // sizes the two screens already used for this sentence.
  const variant = consent ? 'caption' : 'hint';
  // The copy is one interpolated sentence so a translator can move the links
  // within it; the two placeholders split it into the three literal runs.
  const [before, rest] = sentence.split('{{termsLink}}');
  const [middle, after] = (rest ?? '').split('{{privacyLink}}');

  return (
    <Text
      variant={variant}
      tone="muted"
      style={[consent ? styles.consent : styles.line, style]}
      testID={testID}
    >
      {before}
      <Text variant={variant} tone="primary" onPress={() => void Linking.openURL(TERMS_URL)}>
        {t('termsLink')}
      </Text>
      {middle}
      <Text variant={variant} tone="primary" onPress={() => void Linking.openURL(PRIVACY_URL)}>
        {t('privacyLink')}
      </Text>
      {after}
    </Text>
  );
}

/**
 * The consent sentence as ONE plain string — the accessible name for the
 * checkbox that `<TermsLine copy="consent" />` labels.
 *
 * The box carries no text of its own now that the sentence is its sibling, so
 * it needs an explicit `accessibilityLabel`; deriving it from the same key,
 * rather than storing a second copy of the wording, is what keeps VoiceOver
 * from announcing something the screen does not say. i18next resolves the two
 * placeholders here and leaves them alone in the component above, which is the
 * same behaviour the disclosure sentence has always relied on.
 */
export function useTermsConsentLabel(): string {
  const { t } = useT('auth');
  return t('termsConsentSentence', { termsLink: t('termsLink'), privacyLink: t('privacyLink') });
}

const styles = StyleSheet.create({
  line: { textAlign: 'center' },
  // Ranged against a checkbox in a left-aligned form, not centred under a
  // column of buttons.
  consent: { textAlign: 'left' },
});
