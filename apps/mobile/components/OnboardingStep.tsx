import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactNode } from 'react';

export function OnboardingStep({
  title,
  body,
  primaryLabel,
  onPrimary,
  onSkip,
  primaryDisabled,
  children,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
  primaryDisabled?: boolean;
  children?: ReactNode;
}) {
  const { t } = useT('onboarding');
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.skipRow}>
        <Pressable onPress={onSkip} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.skip}>{t('skip')}</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {children}
      </View>

      <Pressable
        style={[styles.button, primaryDisabled && styles.buttonDisabled]}
        onPress={onPrimary}
        disabled={primaryDisabled}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}

export function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <View style={choiceStyles.row}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            style={[choiceStyles.chip, active && choiceStyles.chipActive]}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[choiceStyles.chipText, active && choiceStyles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const choiceStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  chipActive: { borderColor: '#0B1F3A', backgroundColor: '#0B1F3A' },
  chipText: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  chipTextActive: { color: '#fff' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24 },
  skipRow: { alignItems: 'flex-end' },
  skip: { color: '#0B1F3A', fontSize: 15, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 16, color: '#444', lineHeight: 22, marginBottom: 24 },
  button: { backgroundColor: '#0B1F3A', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
