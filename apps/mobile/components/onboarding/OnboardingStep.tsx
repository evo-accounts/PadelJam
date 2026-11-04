import { useT } from '@padel/i18n';
import { buttonSize } from '@padel/ui';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ReactNode } from 'react';
import type { OnboardingQuestionStep } from '../../lib/postVerifyRoute';
import { Button, IconButton, Text } from '../ui';
import { Text as RNText } from '../ui/native';
import { colors, onboardingColors, radius, space, type } from '../../theme';
import { questionProgress } from './progress';

type Common = {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Spinner on the primary action; blocks presses, keeps the label. */
  primaryLoading?: boolean;
  children?: ReactNode;
};

/** Frames 1 and 9: no back, optional Skip, two stacked actions, art in the middle. */
export type IntroProps = Common & {
  header: 'intro';
  onSkip?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** The illustration that fills the middle. Absent, the middle is empty space. */
  art?: ReactNode;
};

/** Frames 3 to 6: back, "n/N" progress, one pinned Continue. */
export type QuestionProps = Common & {
  header: 'question';
  /** Which of `ONBOARDING_QUESTION_STEPS` this is; the bar derives n and N from it. */
  step: OnboardingQuestionStep;
  onBack: () => void;
};

export function OnboardingStep(props: IntroProps | QuestionProps) {
  const { title, body, primaryLabel, onPrimary, primaryDisabled, primaryLoading, children } = props;
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
   * So: the content scrolls, and the actions are pinned as the last children of
   * the KeyboardAvoidingView rather than inside the scroll area — the distinction
   * that matters, since an action inside the scroller just scrolls out of the
   * shrunken viewport instead of staying above the keyboard.
   */
  return (
    // The bottom inset is on `actions`, not here: with behavior="padding" RN overwrites this
    // view's paddingBottom with the keyboard height (0 when closed), so it would be lost.
    // The negative offset stops the inset being counted twice when the keyboard is open.
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + space[4] }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={-insets.bottom}
    >
      {props.header === 'question' ? (
        <QuestionHeader step={props.step} onBack={props.onBack} />
      ) : (
        <IntroHeader onSkip={props.onSkip} />
      )}

      <ScrollView
        // Reaches the screen edge (the container pads 24 each side, which would otherwise clip
        // art that bleeds off the sides); `content` puts the same padding back for everything in it.
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text variant="display" tone="cardForeground" style={styles.title}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
        {children}
        {props.header === 'intro' && props.art ? <View style={styles.art}>{props.art}</View> : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space[6] }]}>
        <Button
          size="lg"
          fullWidth
          label={primaryLabel}
          onPress={onPrimary}
          disabled={primaryDisabled}
          loading={primaryLoading}
        />
        {props.header === 'intro' && props.secondaryLabel && props.onSecondary ? (
          <SecondaryAction label={props.secondaryLabel} onPress={props.onSecondary} />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function IntroHeader({ onSkip }: { onSkip?: () => void }) {
  const { t } = useT('onboarding');
  return (
    <View style={styles.headerRow}>
      <View />
      {onSkip ? <Button variant="tertiary" size="sm" label={t('skip')} onPress={onSkip} /> : null}
    </View>
  );
}

function QuestionHeader({ step, onBack }: { step: OnboardingQuestionStep; onBack: () => void }) {
  const { t } = useT('onboarding');
  const { n, total } = questionProgress(step);
  return (
    <View style={styles.headerRow}>
      {/* IconButton, not Button: `back` is the glyph "‹", and Button derives
          its accessible name FROM the label — so a screen reader announced
          "single left-pointing angle quotation mark". IconButton takes the
          visual and the name separately, and requires the name. */}
      <IconButton
        icon={t('back')}
        accessibilityLabel={t('backLabel')}
        size="lg"
        style={styles.back}
        onPress={onBack}
      />
      {/* One element: "Step 2 of 3", with the value, instead of a bar and a stray number. */}
      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('progressStep', { n, total })}
        accessibilityValue={{ min: 1, max: total, now: n }}
        testID="onboarding-progress"
      >
        <View style={styles.segments}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.segment, i < n && styles.segmentFilled]} />
          ))}
        </View>
        <RNText style={[type.caption, styles.progressLabel]}>{`${n}/${total}`}</RNText>
      </View>
    </View>
  );
}

/** The grey action under the primary one. `Button`'s `secondary` has slate-700 text; the design is slate-800. */
function SecondaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
    >
      <RNText style={[type.buttonLg, styles.secondaryLabel]} numberOfLines={1}>
        {label}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space[6] },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[4],
    minHeight: buttonSize.lg.height - space[3],
  },
  back: { backgroundColor: onboardingColors.backBg, borderRadius: radius.lg },
  progress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  progressLabel: { color: onboardingColors.progressLabel },
  segments: { flex: 1, flexDirection: 'row', gap: space[1] },
  segment: {
    flex: 1,
    height: space[1.5],
    borderRadius: radius.full,
    backgroundColor: onboardingColors.progressTrack,
  },
  segmentFilled: { backgroundColor: onboardingColors.progressFill },
  scroll: { marginHorizontal: -space[6] },
  content: { flexGrow: 1, paddingTop: space[6], paddingHorizontal: space[6] },
  title: { marginBottom: space[3] },
  body: { marginBottom: space[6] },
  art: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: space[3], paddingTop: space[4] },
  secondary: {
    alignSelf: 'stretch',
    height: buttonSize.lg.height,
    borderRadius: buttonSize.lg.radius,
    backgroundColor: onboardingColors.secondaryActionBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: buttonSize.lg.paddingX,
  },
  secondaryPressed: { opacity: 0.7 },
  secondaryLabel: { color: onboardingColors.secondaryActionFg },
});
