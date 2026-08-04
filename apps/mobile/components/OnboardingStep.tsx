import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactNode } from 'react';
import { Button, IconButton, Text } from './ui';
import { colors } from '../theme';

export function OnboardingStep({
  title,
  body,
  primaryLabel,
  onPrimary,
  onSkip,
  onBack,
  primaryDisabled,
  hidePrimary,
  children,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip: () => void;
  onBack?: () => void;
  primaryDisabled?: boolean;
  hidePrimary?: boolean;
  children?: ReactNode;
}) {
  const { t } = useT('onboarding');
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.headerRow}>
        {/* IconButton, not Button: `back` is the glyph "‹", and Button derives
            its accessible name FROM the label — so a screen reader announced
            "single left-pointing angle quotation mark". IconButton takes the
            visual and the name separately, and requires the name. */}
        {onBack ? (
          <IconButton icon={t('back')} accessibilityLabel={t('backLabel')} onPress={onBack} />
        ) : (
          <View />
        )}
        <Button variant="ghost" size="sm" label={t('skip')} onPress={onSkip} />
      </View>

      <View style={styles.content}>
        <Text variant="display" style={styles.title}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
        {children}
      </View>

      {!hidePrimary && (
        <Button fullWidth label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} />
      )}
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
            <Text variant="bodyStrong" tone={active ? 'inverse' : 'default'}>
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
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  chipActive: { borderColor: colors.foreground, backgroundColor: colors.primary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card, paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { flex: 1, justifyContent: 'center' },
  title: { marginBottom: 12 },
  body: { lineHeight: 22, marginBottom: 24 },
});
