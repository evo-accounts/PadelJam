/**
 * ListRow — leading slot, title, subtitle, trailing slot.
 *
 * 31 files declare a `row:` style. They fall into exactly two shapes, so this
 * takes a variant rather than pretending they are one thing:
 *
 *   `card`    a rounded surface with its own margins, floating on the page
 *             (notifications) — separated by GAPS
 *   `plain`   a flat row with a hairline underneath (chat channels) — separated
 *             by RULES
 *
 * Mixing them in one list is what makes a screen feel unfinished, so the choice
 * is explicit at the call site instead of emerging from whichever file was
 * copied.
 */
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

export type ListRowVariant = 'card' | 'plain';

type Props = {
  title: string;
  subtitle?: string;
  /** Avatar, icon, or anything else that leads the row. */
  leading?: React.ReactNode;
  /** Badge, chevron, timestamp. */
  trailing?: React.ReactNode;
  /**
   * What the trailing slot SAYS, when it says something.
   *
   * `Pressable` defaults to `accessible={true}`, so setting an
   * accessibilityLabel below collapses the whole row into one element and its
   * children stop being announced individually. A decorative trailing (a `›`)
   * losing its own node is the point; an informative one (a pending count, a
   * language, "joined") silently going unannounced is a regression — and it
   * shipped in four screens before an E2E assertion on the notifications banner
   * caught it.
   *
   * Pass this whenever `trailing` carries INFORMATION rather than decoration.
   */
  trailingLabel?: string;
  /**
   * The trailing slot is a CONTROL — a Button, an IconButton — with its own
   * press handler.
   *
   * A pressable row is ONE accessibility element (see `trailingLabel`), so a
   * control placed inside it can neither be reached nor activated by VoiceOver:
   * the notifications "Join" / "Confirm spot" CTA shipped exactly that way.
   * With this flag the row renders as two SIBLINGS — the pressable body and the
   * trailing control — the structure `chat/ChannelRow` hand-rolls for its kebab.
   *
   * `trailingLabel` is ignored here: the control names itself, and repeating its
   * label on the row would announce the same word twice.
   *
   * `disabled` still greys and disables the ROW's body; the control keeps
   * whatever disabled state its own call site gave it, because the row does not
   * own it.
   */
  trailingInteractive?: boolean;
  variant?: ListRowVariant;
  /**
   * Tone for the title. `destructive` exists for the one row every settings
   * list has — "Delete account" — which was otherwise the single hand-rolled
   * Pressable sitting among nine ListRows, i.e. exactly the drift this
   * component prevents everywhere else.
   */
  titleTone?: 'default' | 'destructive';
  /**
   * Tone for the subtitle. `destructive` marks a per-row error (e.g. a failed
   * CTA) — it also flips the subtitle's accessibilityRole to `alert` so
   * assistive tech announces it as an error rather than silent caption text.
   */
  subtitleTone?: 'muted' | 'destructive';
  /**
   * How many lines the subtitle may occupy before it truncates. Defaults to 1, which is right for
   * the trailing scraps most rows carry ("3 members", "Last played Tuesday").
   *
   * Pass 2 for a row whose subtitle is a SENTENCE describing where it leads. UX-SET-05/12/13 put
   * descriptions under every row, and at one line they truncated mid-word — "See who you blocked,
   * and unblock them…" — which turns an explanation into a tease. The accessible name was never
   * affected: it joins title and subtitle in full, so this is a visual fix only.
   */
  subtitleLines?: number;
  /** Draws attention without colour alone — pairs with an accessibilityValue. */
  highlighted?: boolean;
  /**
   * For rows in a multi-select list. Distinct from `trailingLabel`: a `✓` is
   * not information to be read out, it is a STATE, and assistive tech has a
   * dedicated channel for that. Without this, a checkmark in the trailing slot
   * is announced as nothing at all.
   */
  selected?: boolean;
  /** Greys the row out (opacity 0.45) and marks it disabled for assistive tech; onPress stops firing. */
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  trailingLabel,
  trailingInteractive = false,
  variant = 'plain',
  titleTone = 'default',
  subtitleTone = 'muted',
  subtitleLines = 1,
  highlighted = false,
  selected,
  disabled = false,
  onPress,
  style,
  testID,
}: Props) {
  const main = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={titleTone} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            tone={subtitleTone}
            numberOfLines={subtitleLines}
            style={styles.subtitle}
            accessibilityRole={subtitleTone === 'destructive' ? 'alert' : undefined}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );
  const trailingSlot = trailing ? <View style={styles.trailing}>{trailing}</View> : null;
  const body = (
    <>
      {main}
      {trailingSlot}
    </>
  );

  const surface = [
    styles.base,
    variant === 'card' ? styles.card : styles.plain,
    highlighted && styles.highlighted,
    style,
  ];

  if (!onPress) {
    return (
      <View testID={testID} style={surface}>
        {body}
      </View>
    );
  }

  // One expression, used by BOTH shapes below: `disabled` landed after the
  // split branch was first sketched, and a second hand-written copy is exactly
  // how one of them silently loses it again.
  const accessibilityState =
    selected === undefined && !disabled
      ? undefined
      : { ...(selected === undefined ? {} : { selected }), ...(disabled ? { disabled: true } : {}) };

  if (trailingInteractive && trailingSlot) {
    // The surface stays a plain View (and keeps the testID, so E2E selectors do
    // not move); the pressable shrinks to the body and the control sits beside
    // it, reachable as its own element.
    //
    // The body stretches to the surface's content height and its hit area is
    // slopped out by the surface padding, so a finger landing anywhere on the
    // card that is not the control still opens the row — measured at 24pt of
    // text inside a 56pt card, which is the target the single-pressable shape
    // had. No `right` slop: that is where the control lives.
    const pad = variant === 'card' ? space[4] : space[3];
    return (
      <View testID={testID} style={[...surface, styles.split, disabled && styles.disabled]}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          // No `trailingLabel`: the control announces itself.
          accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
          accessibilityState={accessibilityState}
          hitSlop={{ top: pad, bottom: pad, left: pad }}
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
        >
          {main}
        </Pressable>
        {trailingSlot}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // ", " and not ". ": when a container has no explicit label, iOS builds
      // one by joining its children with a comma. That is the announcement this
      // row had before it became a ListRow, and what the suite-08 selector
      // (/partner requests, \d+ pending/i) was written against. The captured
      // tree from the failure read exactly "Partner Requests" — no separator at
      // all — so the count had to come back AND come back joined the same way.
      accessibilityLabel={[title, subtitle, trailingLabel].filter(Boolean).join(', ')}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [...surface, disabled && styles.disabled, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.card,
  },
  card: {
    marginHorizontal: space[3],
    marginBottom: space[2],
    borderRadius: radius.lg,
    padding: space[4],
  },
  plain: {
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    // hairlineWidth, not 1: on a 3x screen a 1pt rule is three device pixels and
    // reads as a heavy line rather than a separator.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.muted,
  },
  highlighted: { backgroundColor: colors.accent },
  disabled: { opacity: 0.45 },
  // A row whose trailing is interactive: the surface lets its two children
  // stretch, so the pressable body is as tall as the control beside it.
  split: { alignItems: 'stretch' },
  // The body of that row: the same row layout as the surface, minus the
  // surface. Only this half dims when pressed.
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  leading: { justifyContent: 'center' },
  text: { flex: 1 },
  subtitle: { marginTop: 2 },
  trailing: { justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
