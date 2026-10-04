/**
 * Illustration — the named slots the sign-in flow reserves for artwork.
 *
 * Some artwork does not exist yet, and waiting for it would either block the
 * screens or scatter throwaway emoji across them. So the registry below holds
 * both halves of each slot: the `source` the real asset occupies (absent, with
 * the line commented out, until it lands — dropping it in is one line) and the
 * `glyph` the placeholder shows until then. Nothing at a call site changes when
 * the art arrives. The three welcome slides are the first slots to have landed.
 *
 * A placeholder deliberately looks like a placeholder — a muted rounded block —
 * rather than like a finished empty state. If it shipped by accident it should
 * be obvious in a screenshot, not plausible.
 *
 * THREE SIZES, TWO RENDERERS. `hero` and `inline` are spot illustrations: the
 * whole picture, letterboxed with `contain` by RN's own `Image`. `cover` is the
 * welcome screen's full-bleed art: it fills a box whose shape the CALLER decides
 * (a flex child that gets taller on an iPad and shorter on an SE), so the image
 * is cropped rather than letterboxed — and cropping needs to know WHERE, which
 * is why each entry carries a `position`, kept on the face of the mascot, and
 * why `cover` goes through `expo-image` (`contentPosition`) while the other two
 * stay on RN `Image`, untouched.
 */
import { Image as ExpoImage, type ImageContentPosition } from 'expo-image';
import { Image, StyleSheet, View, type ImageRequireSource, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';
import { Text } from './Text';

export type IllustrationName =
  | 'welcomeFind'
  | 'welcomeJoin'
  | 'welcomeExplore'
  | 'passwordChanged'
  | 'communityCreated'
  | 'blastSent';

export type IllustrationProps = {
  name: IllustrationName;
  /**
   * 'hero' fills the space it is given (min 180, max 320); 'inline' is a 120pt
   * square; 'cover' is full-bleed art that crops to whatever box the caller gives
   * it (`style` must size it — a `flex: 1` child, say).
   */
  size?: 'hero' | 'inline' | 'cover';
  /**
   * Describe the art ONLY when it carries meaning the surrounding copy does not.
   * Omitted, the illustration is decorative and is hidden from assistive tech —
   * which is the right answer for a welcome slide whose title already says it.
   */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

type Entry = {
  /** A `require()` result. Absent while the slot is a placeholder. */
  source?: ImageRequireSource;
  glyph: string;
  /**
   * Where `cover` keeps the image when it has to crop (CSS `object-position`).
   * Horizontal is centred everywhere — the crop on a tall phone is a few points.
   * Vertical is the mascot's face: on a short phone (iPhone SE, art box ~299pt
   * against a 458pt-tall image at that width) the box shows barely two thirds of
   * the picture, and a centred crop would behead the fox.
   */
  position?: ImageContentPosition;
};

/**
 * Name -> artwork. Uncomment the `source` line when the asset lands; the
 * placeholder branch then stops being reached and nothing else moves.
 */
const REGISTRY: Record<IllustrationName, Entry> = {
  // All three welcome files are 1170x1428 (390x476 at 3x), opaque, with no baked
  // corners — the sheet's rounded top edge is drawn over them by welcome.tsx.
  welcomeFind: {
    source: require('../../assets/illustrations/welcome-find.webp'),
    glyph: '🎾',
    position: { top: '62%', left: '50%' },
  },
  welcomeJoin: {
    source: require('../../assets/illustrations/welcome-join.webp'),
    glyph: '👥',
    position: { top: '50%', left: '50%' },
  },
  welcomeExplore: {
    source: require('../../assets/illustrations/welcome-explore.webp'),
    glyph: '🏆',
    position: { top: '58%', left: '50%' },
  },
  // source: require('../../assets/illustrations/password-changed.png'),
  passwordChanged: { glyph: '✅' },
  // UX-COMM-02 asks for a generic success image, explicitly unrelated to the
  // community's own cover — this is the placeholder until artwork lands.
  communityCreated: { glyph: '🎉' },
  // UX-MEVT-18's "Blast sent!" confirmation — placeholder until the artwork lands.
  blastSent: { glyph: '📣' },
};

export function Illustration({ name, size = 'hero', accessibilityLabel, style, testID }: IllustrationProps) {
  const art = REGISTRY[name];
  const decorative = !accessibilityLabel;
  const box = size === 'hero' ? styles.hero : size === 'cover' ? styles.cover : styles.inline;

  // Hidden from BOTH trees when decorative: iOS honours accessibilityElementsHidden,
  // Android importantForAccessibility, and a decorative image announced as
  // "image" is noise on a screen whose copy already says everything.
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const }
    : { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel };

  // The outer View owns the SIZE in both branches, so `style` stays a ViewStyle
  // and the artwork landing cannot change what a call site is allowed to pass.
  return (
    <View style={[box, !art.source && styles.placeholder, style]} testID={testID} {...a11y}>
      {art.source ? (
        size === 'cover' ? (
          // `priority="high"`: this is the first thing on the first screen.
          <ExpoImage
            source={art.source}
            contentFit="cover"
            contentPosition={art.position}
            priority="high"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <Image source={art.source} resizeMode="contain" style={styles.image} />
        )
      ) : (
        <Text variant={size === 'inline' ? 'title' : 'display'}>{art.glyph}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignSelf: 'stretch', minHeight: 180, maxHeight: 320, alignItems: 'center', justifyContent: 'center' },
  inline: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  // No size of its own: the caller's `style` gives it one. `overflow: hidden`
  // because the image is absolutely filled and cropped, not letterboxed.
  cover: { alignSelf: 'stretch', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
