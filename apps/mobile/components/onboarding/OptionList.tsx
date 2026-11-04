/**
 * OptionList / OptionCard — the single-select cards of the onboarding question
 * steps (frames 3 to 5): a title, an optional description and, on the selected
 * card, a badge overlapping its top-right corner.
 *
 * Not `ui/RadioCardGroup`: that is a bordered row with a radio dot, for forms.
 * These are the onboarding design's own card, with its own tokens
 * (`onboarding.option*`).
 *
 * Accessibility: the container is a `radiogroup` and each card a `radio` whose
 * name is its title and whose state is `checked`. The E2E harness finds a card
 * by that name, so a visible title is also its label.
 */
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { onboardingColors, radius, space } from '../../theme';
import { Text } from '../ui';
import { Text as RNText } from '../ui/native';
import { type } from '../../theme';

export type Option<T extends string> = {
  value: T;
  title: string;
  description?: string;
  /** Shown overlapping the top-right corner while this card is selected. */
  badge?: ImageSourcePropType;
};

const BORDER = 2;
const BADGE = 40;

export function OptionCard({
  title,
  description,
  badge,
  checked,
  disabled = false,
  onPress,
  testID,
}: {
  title: string;
  description?: string;
  badge?: ImageSourcePropType;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ checked, disabled }}
      style={[styles.card, checked && styles.cardChecked, disabled && styles.disabled]}
      testID={testID}
    >
      <RNText style={[type.bodyStrong, checked ? styles.titleChecked : styles.title]}>{title}</RNText>
      {description ? (
        <Text variant="caption" tone="muted" style={styles.description}>
          {description}
        </Text>
      ) : null}
      {checked && badge ? (
        // Decorative: the checked state already says it.
        <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image source={badge} style={styles.badgeImage} resizeMode="contain" />
        </View>
      ) : null}
    </Pressable>
  );
}

export function OptionList<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  testID,
}: {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.list} testID={testID}>
      {options.map((option) => (
        <OptionCard
          key={option.value}
          title={option.title}
          description={option.description}
          badge={option.badge}
          checked={option.value === value}
          disabled={disabled}
          onPress={() => onChange(option.value)}
          testID={testID ? `${testID}-${option.value}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
  card: {
    borderWidth: BORDER,
    // Transparent while unselected, so the card does not grow by the border when selected.
    borderColor: 'transparent',
    borderRadius: radius['2xl'],
    backgroundColor: onboardingColors.optionBg,
    paddingHorizontal: space[5],
    paddingVertical: space[4],
  },
  cardChecked: {
    backgroundColor: onboardingColors.optionSelectedBg,
    borderColor: onboardingColors.optionSelectedBorder,
  },
  disabled: { opacity: 0.5 },
  title: { color: onboardingColors.optionTitle },
  titleChecked: { color: onboardingColors.optionSelectedTitle },
  description: { marginTop: space[1] },
  badge: { position: 'absolute', top: -space[3], right: -space[2], width: BADGE, height: BADGE },
  badgeImage: { width: BADGE, height: BADGE },
});
