/**
 * Dots — the page indicator under a carousel. Two hand-rolled copies existed
 * (welcome.tsx, and the event wizard's old StepIndicator, since replaced by
 * ProgressBar — UX-CEVT-01), differing in dot size, gap and inactive colour.
 *
 * The accessibility shape is the point of having one: a row of coloured circles
 * is meaningless to a screen reader, and six or eight of them are six or eight
 * elements to swipe past. So the ROW carries the name ("Page 2 of 3") and the
 * individual dots are hidden.
 *
 * `decorative` takes the row out of the accessibility tree altogether, for a
 * screen where "Page 2 of 3" tells nobody anything they can act on and where an
 * accessible View that is not a button is a liability. The welcome screen is
 * both: VoiceOver cannot page it (the copy is already announced), and its views
 * are the first ones Fabric recycles into every screen after it. An accessible
 * non-button View that gets recycled into a Pressable keeps the role iOS cached
 * for it, so the Pressable reads as AXGenericElement, not Button — with this
 * row accessible, the onboarding "Left" tile did exactly that, two screens later.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';

export type DotsProps = {
  count: number;
  /** Zero-based. */
  index: number;
  /**
   * `'soft'` is the welcome design's indicator: a 4pt gap between the dots and
   * an inactive dot at slate-200 (`colors.muted`) instead of slate-400 (`ring`).
   * Opt-in, so the default row is unchanged for every other caller and for the
   * design-system gallery.
   */
  variant?: 'default' | 'soft';
  /** Hide the whole row from assistive tech — see the header for when. */
  decorative?: boolean;
  /** Overrides the default "Page N of M" — pass what the dots actually mean. */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

/** Exported for the one caller that has to reserve the row's height. */
export const DOT_SIZE = 8;

export function Dots({
  count,
  index,
  variant = 'default',
  decorative = false,
  accessibilityLabel,
  style,
  testID,
}: DotsProps) {
  const { t } = useT('common');
  if (count <= 0) return null;

  const current = Math.min(Math.max(index, 0), count - 1);
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
    : {
        accessible: true,
        accessibilityLabel: accessibilityLabel ?? t('pageProgress', { current: current + 1, total: count }),
      };

  return (
    <View style={[styles.row, variant === 'soft' && styles.rowSoft, style]} testID={testID} {...a11y}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={`dot-${i}`}
          style={[
            styles.dot,
            i === current ? styles.dotActive : variant === 'soft' ? styles.dotInactiveSoft : styles.dotInactive,
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  rowSoft: { gap: space[1] },
  dot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: radius.full },
  dotActive: { backgroundColor: colors.primary },
  dotInactive: { backgroundColor: colors.ring },
  dotInactiveSoft: { backgroundColor: colors.muted },
});
