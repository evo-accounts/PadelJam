/**
 * PasswordField — a `Field` with a show/hide eye and, on creation/change
 * screens, a live four-rule checklist (UX-GLOB-07).
 *
 * The eye is an `IconButton` (never a bare glyph) positioned to sit centred
 * on the 44pt input regardless of whether a label is present — see the
 * geometry constants below, derived from `Field`'s own layout rather than
 * eyeballed, so a change to the label type role or the input height keeps
 * this in sync instead of silently drifting off-centre.
 */
import { useT } from '@padel/i18n';
import { passwordRules, PASSWORD_RULE_KEYS, type PasswordRuleKey } from '@padel/utils';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, space, type as typeScale } from '../../theme';
import { Field } from './Field';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label?: string;
  value: string;
  /** Show the four-rule checklist with live state (creation/change screens). */
  showRules?: boolean;
  error?: string | null;
  containerStyle?: ViewStyle;
  testID?: string;
};

/** Rule key -> the copy key in `common.json`. */
const RULE_KEY: Record<PasswordRuleKey, string> = {
  minLength: 'ruleMinLength',
  uppercase: 'ruleUppercase',
  number: 'ruleNumber',
  symbol: 'ruleSymbol',
};

// `Field`'s input is a fixed 44pt tall (see Field.tsx `styles.input.minHeight`).
const INPUT_HEIGHT = 44;
// IconButton size="md" is a 36pt box (see IconButton.tsx `sizes.md.box`).
const EYE_BOX = 36;
// Centres the eye inside the 44pt input when there is no label above it.
const EYE_TOP_NO_LABEL = (INPUT_HEIGHT - EYE_BOX) / 2;
// `Field`'s label row is its `label` type role's line height plus the
// `space[1]` margin the label carries before the input (see Field.tsx
// `styles.label.marginBottom`). Adding that offset keeps the eye centred on
// the input itself, not on the label-plus-input block.
const LABEL_HEIGHT = typeScale.label.lineHeight + space[1];
const EYE_TOP_WITH_LABEL = LABEL_HEIGHT + EYE_TOP_NO_LABEL;

export function PasswordField({ label, value, showRules = false, error, containerStyle, testID, ...rest }: Props) {
  const { t } = useT('common');
  const [visible, setVisible] = useState(false);
  const rules = passwordRules(value);

  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        <Field
          label={label}
          value={value}
          error={error}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          // Not `newPassword`: iOS then presents its own "Use Strong Password?" sheet
          // over the input, which hides the checklist and blocks typing in the simulator.
          textContentType="password"
          containerStyle={styles.field}
          testID={testID}
          {...rest}
        />
        <IconButton
          icon={
            <SymbolView
              name={{
                ios: visible ? 'eye.slash' : 'eye',
                android: visible ? 'visibility_off' : 'visibility',
                web: visible ? 'visibility_off' : 'visibility',
              }}
              size={20}
              tintColor={colors.mutedForeground}
            />
          }
          accessibilityLabel={t(visible ? 'hidePassword' : 'showPassword')}
          size="md"
          onPress={() => setVisible((v) => !v)}
          style={{ ...styles.eye, top: label ? EYE_TOP_WITH_LABEL : EYE_TOP_NO_LABEL }}
          testID={testID ? `${testID}-toggle` : undefined}
        />
      </View>
      {showRules ? (
        <View style={styles.rules} accessibilityRole="list">
          {PASSWORD_RULE_KEYS.map((k) => {
            const met = rules[k];
            const ruleLabel = t(RULE_KEY[k]);
            return (
              <Text
                key={k}
                variant="hint"
                tone={met ? 'success' : 'muted'}
                accessibilityLabel={`${ruleLabel}: ${met ? t('ruleMet') : t('ruleMissing')}`}
              >
                {met ? '✓ ' : '○ '}
                {ruleLabel}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  field: { flex: 1 },
  eye: { position: 'absolute', right: space[2] },
  rules: { marginTop: space[2], gap: space[1] },
});
