import { useT } from '@padel/i18n';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

  /*
   * The primary action must stay ABOVE the keyboard.
   *
   * This was a plain flex column with the button pinned last, and no keyboard
   * avoidance at all. Once Xcode 27 started showing the software keyboard, the
   * button on the location step was not merely hidden behind it — it left the
   * accessibility tree entirely. Measured on the device: keyboard top y=590, and
   * the lowest element of any kind y=583.
   *
   * That makes it unreachable to VoiceOver, which can only navigate what the
   * tree contains, and it is a dead end for anyone who does not think to dismiss
   * the keyboard first. It also failed all four onboarding end-to-end tests,
   * which are sequential through this one screen.
   *
   * So: the content scrolls, and the action is pinned as the last child of the
   * KeyboardAvoidingView rather than inside the scroll area — the distinction
   * that matters, since an action inside the scroller just scrolls out of the
   * shrunken viewport instead of staying above the keyboard.
   */
  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="display" style={styles.title}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
        {children}
      </ScrollView>

      {!hidePrimary && (
        <Button fullWidth label={primaryLabel} onPress={onPrimary} disabled={primaryDisabled} />
      )}
    </KeyboardAvoidingView>
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
  content: { flexGrow: 1, justifyContent: 'center' },
  title: { marginBottom: 12 },
  body: { lineHeight: 22, marginBottom: 24 },
});
