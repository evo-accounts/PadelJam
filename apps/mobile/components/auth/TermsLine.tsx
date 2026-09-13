/**
 * TermsLine — "By continuing, you agree to our Terms of Use and Privacy Policy."
 *
 * Extracted because it is rendered on more than one screen (sign-in, and the
 * consent copy on create-account), and each copy re-split the interpolated
 * string and re-declared the two URLs. A sentence with tappable spans inside it
 * cannot be assembled by a call site without also re-deriving the styling of
 * those spans, which is how the three existing copies drifted apart.
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
 * Exported because create-account's consent CHECKBOX links to the same two
 * documents with different wording ("I agree to the …" rather than "By
 * continuing, you agree to our …"), so it cannot reuse this component — but it
 * must not re-declare the URLs either. That is how the three earlier copies of
 * this sentence drifted apart in the first place.
 */
export const TERMS_URL = 'https://padeljam.app/terms';
export const PRIVACY_URL = 'https://padeljam.app/privacy';

type Props = {
  style?: StyleProp<TextStyle>;
  testID?: string;
};

export function TermsLine({ style, testID }: Props) {
  const { t } = useT('auth');
  // The copy is one interpolated sentence so a translator can move the links
  // within it; the two placeholders split it into the three literal runs.
  const [before, rest] = t('socialTermsDisclosure').split('{{termsLink}}');
  const [middle, after] = (rest ?? '').split('{{privacyLink}}');

  return (
    <Text variant="hint" tone="muted" style={[styles.line, style]} testID={testID}>
      {before}
      <Text variant="hint" tone="primary" onPress={() => void Linking.openURL(TERMS_URL)}>
        {t('termsLink')}
      </Text>
      {middle}
      <Text variant="hint" tone="primary" onPress={() => void Linking.openURL(PRIVACY_URL)}>
        {t('privacyLink')}
      </Text>
      {after}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { textAlign: 'center' },
});
