import { useT } from '@padel/i18n';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme';

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
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.title}>{t('rulesToggle')}</Text>
          <Text style={styles.desc}>{t('rulesToggleDesc')}</Text>
        </View>
        <Switch value={enabled} onValueChange={onToggle} disabled={disabled} />
      </View>
      {enabled ? (
        <>
          <Text style={styles.label}>{t('rulesLabel')}</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={onChangeText}
            placeholder={t('rulesPlaceholder')}
            multiline
            editable={!disabled}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  textCol: { flex: 1, paddingRight: 12 },
  title: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  desc: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  label: { fontSize: 14, color: colors.mutedForeground, marginTop: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  error: { color: colors.destructive, marginTop: 8 },
});
