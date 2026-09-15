/**
 * Cancellation rules: a labelled switch, and the rules text once it is on.
 *
 * The row is `SwitchRow` and the input is `Field`, so this file is now the
 * community copy and the reveal, nothing else.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { Field, SwitchRow } from '../ui';
import { space } from '../../theme';

export function RulesToggle({
  enabled,
  text,
  onToggle,
  onChangeText,
  error,
  disabled,
}: {
  enabled: boolean;
  text: string;
  onToggle: (value: boolean) => void;
  onChangeText: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const { t } = useT('community');
  return (
    <View style={styles.container}>
      <SwitchRow
        label={t('rulesToggle')}
        description={t('rulesToggleDesc')}
        value={enabled}
        onValueChange={onToggle}
        disabled={disabled}
        testID="community-rules-toggle"
      />
      {enabled ? (
        <Field
          label={t('rulesLabel')}
          value={text}
          onChangeText={onChangeText}
          placeholder={t('rulesPlaceholder')}
          multiline
          editable={!disabled}
          error={error ?? undefined}
          containerStyle={styles.input}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: space[4] },
  input: { marginTop: space[3] },
});
