import { SCORING_MODES, type ScoringMode } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import {
  CUSTOM_POINTS_MAX,
  isPreset,
  MINUTES_MAX,
  MINUTES_MIN,
  parseCustomPoints,
  POINTS_PRESETS,
  scoringDefault,
} from '../scoring';
import { Slider } from '../Slider';
import { colors, palette, radius, space, type } from '../../../../theme';
import { BottomSheet, Button, Chip, Text } from '../../../ui';

const capOf = (mode: ScoringMode) => `scoring${mode[0]?.toUpperCase() ?? ''}${mode.slice(1)}`;

/**
 * Scoring (UX-CEVT-05, B16). Three collapsed cards; selecting one expands it in place and
 * collapses the others, and the value it needs is set INSIDE the card rather than in a field
 * under the list. Points: presets 8–40 with 32 selected, plus Custom (1–99) in a sheet. Time: a
 * slider, 1–90 minutes, default 10. Classic sets: selection only.
 *
 * A multi-value step, so it keeps the wizard's fixed primary button; that button validates on
 * tap (UX-GLOB-06) and flags the missing choice here.
 */
export function Step4Scoring({ draft, patch, errors, clearError }: WizardStepProps) {
  const { t } = useT('event');
  const [customOpen, setCustomOpen] = useState(false);
  const flagged = errors?.includes('scoringMode') || errors?.includes('scoringValue');

  const select = (mode: ScoringMode) => {
    // Re-selecting the open card keeps its value; switching starts the new mode at its default.
    if (draft.scoringMode === mode) return;
    patch({ scoringMode: mode, scoringValue: scoringDefault(mode) });
    clearError?.('scoringMode');
    clearError?.('scoringValue');
  };

  const setValue = (v: number) => {
    patch({ scoringValue: v });
    clearError?.('scoringValue');
  };

  return (
    <View style={styles.list}>
      {SCORING_MODES.map((mode) => {
        const selected = draft.scoringMode === mode;
        return (
          <View
            key={mode}
            style={[styles.card, selected && styles.cardSelected, flagged && !selected && styles.cardError]}
          >
            <Pressable
              onPress={() => select(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected, expanded: selected }}
              style={styles.header}
            >
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.headerText}>
                <Text variant="bodyStrong" tone="default">
                  {t(`${capOf(mode)}Label`)}
                </Text>
                <Text variant="caption" tone="muted">
                  {t(`${capOf(mode)}Desc`)}
                </Text>
              </View>
            </Pressable>

            {selected && mode === 'points' ? (
              <View style={styles.body}>
                <Text variant="label" tone="default">
                  {t('pointsValueLabel')}
                </Text>
                <View style={styles.chips}>
                  {POINTS_PRESETS.map((n) => (
                    <Chip
                      key={n}
                      label={String(n)}
                      selected={draft.scoringValue === n}
                      onPress={() => setValue(n)}
                    />
                  ))}
                  <Chip
                    label={
                      !isPreset(draft.scoringValue) && draft.scoringValue != null
                        ? t('scoringCustomValue', { value: draft.scoringValue })
                        : t('scoringCustom')
                    }
                    selected={!isPreset(draft.scoringValue) && draft.scoringValue != null}
                    onPress={() => setCustomOpen(true)}
                    testID="scoring-points-custom"
                  />
                </View>
              </View>
            ) : null}

            {selected && mode === 'time' ? (
              <View style={styles.body}>
                <Slider
                  label={t('timeValueLabel')}
                  value={draft.scoringValue ?? MINUTES_MIN}
                  min={MINUTES_MIN}
                  max={MINUTES_MAX}
                  onChange={setValue}
                  formatValue={(n) => t('minutesValue', { count: n })}
                  testID="scoring-time-slider"
                />
              </View>
            ) : null}
          </View>
        );
      })}

      <CustomPointsSheet
        visible={customOpen}
        initial={draft.scoringValue}
        onClose={() => setCustomOpen(false)}
        onSave={(n) => {
          setValue(n);
          setCustomOpen(false);
        }}
      />
    </View>
  );
}

/**
 * Custom points: a centred numeric input with the number pad, and Save above the keyboard — the
 * sheet rides up with it (BottomSheet's KeyboardAvoidingView). Validated on Save, never a
 * disabled button (UX-GLOB-06).
 */
function CustomPointsSheet({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: number | null;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const { t } = useT('event');
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  // Seeded each time it opens, from a custom value if there is one.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setText(initial != null && !isPreset(initial) ? String(initial) : '');
      setInvalid(false);
    }
  }

  const save = () => {
    const n = parseCustomPoints(text);
    if (n == null) {
      setInvalid(true);
      return;
    }
    onSave(n);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('customPointsTitle')}
      testID="custom-points-sheet"
    >
      <View style={styles.sheetBody}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v.replace(/[^0-9]/g, '').slice(0, String(CUSTOM_POINTS_MAX).length));
            setInvalid(false);
          }}
          keyboardType="number-pad"
          autoFocus
          maxLength={String(CUSTOM_POINTS_MAX).length}
          textAlign="center"
          style={[styles.numberInput, invalid && styles.numberInputError]}
          accessibilityLabel={t('customPointsTitle')}
          accessibilityHint={t('customPointsHint')}
          testID="custom-points-input"
          onSubmitEditing={save}
        />
        <Text variant="caption" tone={invalid ? 'destructive' : 'muted'} style={styles.centre}>
          {invalid ? t('customPointsError') : t('customPointsHint')}
        </Text>
        <Button label={t('customPointsSave')} onPress={save} fullWidth testID="custom-points-save" />
      </View>
    </BottomSheet>
  );
}

const RADIO = 20;

const styles = StyleSheet.create({
  list: { gap: space[3] },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: palette.purple[100] },
  cardError: { borderColor: colors.destructive },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[4] },
  headerText: { flex: 1, gap: space[1] },
  radio: {
    width: RADIO,
    height: RADIO,
    marginTop: 2,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: RADIO / 2, height: RADIO / 2, borderRadius: radius.full, backgroundColor: colors.primary },
  body: { gap: space[3], paddingHorizontal: space[4], paddingBottom: space[4] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  sheetBody: { gap: space[3], paddingHorizontal: space[3], paddingBottom: space[2] },
  numberInput: {
    ...type.display,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: space[3],
    alignSelf: 'center',
    minWidth: space[16] + space[8],
  },
  numberInputError: { borderColor: colors.destructive },
  centre: { textAlign: 'center' },
});
