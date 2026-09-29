/**
 * Illustration — the named slots the sign-in flow reserves for artwork.
 *
 * The artwork does not exist yet, and waiting for it would either block the
 * screens or scatter throwaway emoji across them. So the registry below holds
 * both halves of each slot: the `source` the real asset will occupy (present,
 * commented out, so dropping it in is one line) and the `glyph` the placeholder
 * shows until then. Nothing at a call site changes when the art lands.
 *
 * A placeholder deliberately looks like a placeholder — a muted rounded block —
 * rather than like a finished empty state. If it shipped by accident it should
 * be obvious in a screenshot, not plausible.
 */
import { Image, StyleSheet, View, type ImageSourcePropType, type ViewStyle } from 'react-native';

import { colors, radius } from '../../theme';
import { Text } from './Text';

export type IllustrationName =
  | 'welcomeFind'
  | 'welcomeCommunity'
  | 'welcomePlay'
  | 'passwordChanged'
  | 'communityCreated'
  | 'blastSent';

export type IllustrationProps = {
  name: IllustrationName;
  /** 'hero' fills the space it is given (min 180, max 320); 'inline' is a 120pt square. */
  size?: 'hero' | 'inline';
  /**
   * Describe the art ONLY when it carries meaning the surrounding copy does not.
   * Omitted, the illustration is decorative and is hidden from assistive tech —
   * which is the right answer for a welcome slide whose title already says it.
   */
  accessibilityLabel?: string;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Name -> artwork. Uncomment the `source` line when the asset lands; the
 * placeholder branch then stops being reached and nothing else moves.
 */
const REGISTRY: Record<IllustrationName, { source?: ImageSourcePropType; glyph: string }> = {
  // source: require('../../assets/illustrations/welcome-find.png'),
  welcomeFind: { glyph: '🎾' },
  // source: require('../../assets/illustrations/welcome-community.png'),
  welcomeCommunity: { glyph: '👥' },
  // source: require('../../assets/illustrations/welcome-play.png'),
  welcomePlay: { glyph: '🏆' },
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
  const box = size === 'hero' ? styles.hero : styles.inline;

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
        <Image source={art.source} resizeMode="contain" style={styles.image} />
      ) : (
        <Text variant={size === 'hero' ? 'display' : 'title'}>{art.glyph}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignSelf: 'stretch', minHeight: 180, maxHeight: 320, alignItems: 'center', justifyContent: 'center' },
  inline: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  placeholder: {
    backgroundColor: colors.muted,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
