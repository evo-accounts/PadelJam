/**
 * Welcome — three slides over one fixed sheet, and two ways in (UX-AUTH-01).
 *
 * WHAT IS FIXED AND WHAT SWIPES. Full-bleed art fills the top of the screen and
 * a rounded sheet rises over its bottom edge. The ART swipes, and the sheet's
 * TITLE and BODY swipe with it, in lock-step. The sheet itself, the three dots
 * and the two buttons never move — "Get started" and "Sign in" are the same two
 * buttons on every slide, not three pairs sliding past.
 *
 * THE TRAP: Z-ORDER. The stack has to read, bottom to top,
 *
 *     ART (swipes)  <  SHEET SHAPE (fixed)  <  COPY (swipes)  <  dots + buttons (fixed)
 *
 * and no single pager can produce it. If each page were [art][sheet][copy], the
 * sheet's two rounded top corners would ride along with the page and, half-way
 * through a swipe, the seam between two pages would show a notch of art where
 * one sheet ends and the next begins. So there are three layers instead of one:
 *
 *   1. `Carousel` — the art, and the ONLY gesture surface. A real paging
 *      ScrollView (native snapping, native momentum, native rubber-band rules),
 *      sized to the WHOLE screen rather than to the art, so a swipe that starts
 *      on the copy area still lands on it. Each page is the art with an empty
 *      spacer the height of the sheet's visible part under it.
 *   2. The sheet shape, drawn above the pager, with `pointerEvents="none"` so the
 *      swipe goes straight through it.
 *   3. A strip holding all three title/body blocks side by side, above the
 *      shape, translated by `-scrollX` so each block sits exactly over its art.
 *      Also `pointerEvents="none"`. Dots and buttons come last: they must take
 *      touches, and everything around them in that container passes the rest
 *      through (`box-none`), so the gaps between them still swipe.
 *
 * WHY `scrollX` IS A SHARED VALUE. The strip has to follow the finger, not trail
 * it. The scroll offset is read on the UI thread (`Carousel`'s `scrollX`, fed by
 * Reanimated's `useScrollOffset`) and turned into a transform there, so no frame
 * waits on the JS thread — which is busy re-rendering the dots at the very moment
 * a page flips. The strip's width is a percentage of the sheet, not a measured
 * number, so JS never has to be told how wide a page is. Bounces are off: a
 * rubber-band past page 1 would drag the strip, and the art, off their anchors.
 *
 * WHY THE COPY BLOCK HAS A FIXED HEIGHT. The audit's complaint was that the
 * artwork jumped between slides: a title that wraps to two lines in one locale
 * and one in another pushed everything under it by a line. Two lines of title
 * (2 x 40 = 80), the 12 under it, two lines of body (2 x 28 = 56) and the 12 the
 * design leaves below make a 160-point block that holds still across slides. It
 * holds still per DEVICE, not as a constant, because the text has to fit it:
 *
 *  - The title is capped at TITLE_MAX_WIDTH and breaks with iOS's "push-out"
 *    strategy (Android: "balanced"), which never leaves one word alone on the
 *    last line. The design breaks every title in two by hand — "Find games / near
 *    you", "Create or join / in seconds", "Explore your / padel community" — and
 *    no single width reproduces all three greedily. The design's own 316 box makes
 *    slide 3 right (in Atelia "padel community" is 297, and "Explore your padel"
 *    does not fit), and push-out then makes all three right, in every locale —
 *    checked on 402, 390 and 375pt screens. The title does not grow with Dynamic
 *    Type: a larger "padel community" no longer fits that width, and the line it
 *    would drop is exactly the orphan the width exists to prevent.
 *  - The body is 18pt everywhere and gets a THIRD reserved line wherever two may
 *    not hold it: a copy column under 350 wide (some of the nine bodies need three
 *    lines on a 375pt iPhone — SE, mini), or any Dynamic Type size above the
 *    default, where it grows up to BODY_MAX_SCALE. The reservation is per
 *    device, not per slide, so the art still does not move as you swipe; on those
 *    devices a two-line body simply has a line of air under it. Its last two
 *    words are glued together (`keepLastTwoWords`) so a three-line body does not
 *    end on one word.
 *    NOT `adjustsFontSizeToFit`: on Fabric (RN 0.85) `minimumFontScale` is parsed
 *    but never read, and the shrink search stops at about 50% or 75% for
 *    multi-line text — on device a pt-BR body came out at half size on an SE, and
 *    slide 1's body got SMALLER as the user asked for larger text.
 *
 * WHY THE ART HEIGHT IS NOT A NUMBER. The sheet keeps its natural height (384
 * with two body lines, 412 with three, plus the bottom inset or 20, whichever is
 * larger); the art takes everything above it, plus the 36 the sheet overlaps —
 * which is what puts art, not background, behind the rounded corners. On an
 * iPhone SE (667, three body lines) that is 271; on an iPhone 17 Pro (874, inset
 * 34) 492.
 * The sheet's height is COMPUTED from the same constants that lay it out rather
 * than measured with `onLayout`, so the first frame is already right; the art is
 * then a plain flex child, cropped with `cover` around a per-slide focal point
 * (see `Illustration`). On a tablet the whole layout is the phone layout,
 * centred, at most 480 wide — stretching the art would only crop it harder.
 *
 * No TopBar: this is the first screen after the splash and there is nothing to
 * go back to. No consent line either — it moved to sign-in, where the sign-in
 * methods it refers to actually are (UX-AUTH-02). Both buttons go there: the
 * combined "Login or Sign Up" screen decides which of the two a person needs,
 * and `create-account` needs a live session so it is not a target from here.
 * Either one records that welcome has been seen, so it is first-install only.
 *
 * The art runs under the status bar, so this screen takes the top inset off
 * (there is no SafeAreaView) and sets the bar's icons dark for the pale sky.
 *
 * NOTHING HERE IS AN ACCESSIBLE VIEW EXCEPT THE TWO BUTTONS. The dots are
 * `decorative` (see `Dots`): an accessible non-button View on this screen gets
 * recycled by Fabric into a Pressable on a later screen, which then reads as
 * AXGenericElement rather than Button — the onboarding "Left" tile did, and
 * broke suite 02. Texts are safe (they recycle only into Texts). Keep it that way.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@padel/i18n';
import { buttonSize } from '@padel/ui';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, sheetRadius, space, type } from '../../theme';
import { Button, Carousel, Illustration, Text, type IllustrationName } from '../../components/ui';
import { DOT_SIZE, Dots } from '../../components/ui/Dots';

type Slide = { art: IllustrationName; title: string; body: string };

/** The art runs this far UNDER the sheet's top edge, so its rounded corners cut into art. */
const SHEET_OVERLAP = 36;
const SHEET_PAD_TOP = space[12];
const SHEET_PAD_X = space[5];
/** The design has no home-indicator treatment; the app uses `max(inset, this)`. */
const SHEET_PAD_BOTTOM_MIN = space[5];

const TITLE_BLOCK = type.heroTitle.lineHeight * 2;
/**
 * The design's own title box. In Atelia "padel community" is 297 on device, and
 * "Explore your padel" does not fit, so slide 3 breaks where the design breaks
 * it — see the header. Push-out then fixes slides 1 and 2.
 */
const TITLE_MAX_WIDTH = 316;
const TITLE_BODY_GAP = space[3];
/**
 * The narrowest copy column every body fits in two lines at 18pt: measured on a
 * 390pt iPhone (column 350), first in the system face and again in Outfit, which
 * sets this copy at much the same width. Narrower gets three.
 */
const BODY_TWO_LINE_MIN_WIDTH = 350;
/**
 * Dynamic Type ceiling for the body. At 1.3x every body still fits three lines in
 * a 335 column; beyond it the copy viewport (which must clip — it is what hides
 * the other slides) would start cutting text.
 */
const BODY_MAX_SCALE = 1.3;
/** The design's text frame is 12 taller than its contents; kept, so the dots sit where it puts them. */
const COPY_SLACK = space[3];

const COPY_TO_DOTS = space[6];
const DOTS_TO_BUTTONS = space[6];
const BUTTON_GAP = space[2];
const BUTTONS_HEIGHT = buttonSize.lg.height * 2 + BUTTON_GAP;
/** The sheet from the top of the dots row down, minus its bottom padding. */
const SHEET_FOOTER_HEIGHT = COPY_TO_DOTS + DOT_SIZE + DOTS_TO_BUTTONS + BUTTONS_HEIGHT;

/** Phone layout, centred, on anything wider. */
const MAX_WIDTH = 480;

/**
 * Joins a body's last two words with a no-break space, so a wrapped body never
 * ends on one word ("…closer than you / think."). The title gets the same from
 * `lineBreakStrategyIOS="push-out"`, but iOS only applies push-out to the
 * title's two lines — tested in TextKit 1, TextKit 2 and CoreText, it leaves a
 * three-line body's last line stranded. Done here, not in the strings, so the
 * translations stay plain text.
 */
const keepLastTwoWords = (text: string) => text.replace(/ (\S+)$/, ' $1');

export default function WelcomeScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, fontScale } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const scrollX = useSharedValue(0);
  // Two buttons can be hit in the same breath; one navigation is enough.
  const leaving = useRef(false);

  const slides: Slide[] = [
    { art: 'welcomeFind', title: t('welcomeTitle1'), body: keepLastTwoWords(t('welcomeBody1')) },
    { art: 'welcomeJoin', title: t('welcomeTitle2'), body: keepLastTwoWords(t('welcomeBody2')) },
    { art: 'welcomeExplore', title: t('welcomeTitle3'), body: keepLastTwoWords(t('welcomeBody3')) },
  ];

  const columnWidth = Math.min(windowWidth, MAX_WIDTH);
  // RN scales the body's line height by the same capped multiplier as its font,
  // and below 1 (the small text sizes) by the multiplier itself — so this is the
  // height the body really draws at, not an estimate.
  const bodyScale = Math.min(fontScale, BODY_MAX_SCALE);
  const bodyLines = columnWidth - SHEET_PAD_X * 2 < BODY_TWO_LINE_MIN_WIDTH || fontScale > 1 ? 3 : 2;
  const copyHeight =
    TITLE_BLOCK + TITLE_BODY_GAP + type.heroBody.lineHeight * bodyScale * bodyLines + COPY_SLACK;

  const sheetPadBottom = Math.max(insets.bottom, SHEET_PAD_BOTTOM_MIN);
  // The part of the sheet that is NOT overlapped by art: each art page leaves this
  // much room under itself, which is what makes the art a plain flex child.
  const sheetBelowArt = SHEET_PAD_TOP + copyHeight + SHEET_FOOTER_HEIGHT + sheetPadBottom - SHEET_OVERLAP;

  // `scrollX` is an offset in points and the strip is `slides.length` pages wide,
  // so shifting it left by the offset puts block N over page N.
  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -scrollX.get() }] }));

  const enter = async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await AsyncStorage.setItem('hasSeenWelcome', 'true');
    } catch {
      // Storage refused. Worst case this screen shows again next launch; failing
      // to leave it would be worse, and an unhandled rejection worse still.
    }
    router.replace('/(auth)/sign-in');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.column}>
        <Carousel
          data={slides}
          index={index}
          onIndexChange={setIndex}
          scrollX={scrollX}
          bounces={false}
          showDots={false}
          initialWidth={columnWidth}
          style={styles.carousel}
          renderItem={(slide) => (
            <>
              {/* Decorative: the title over it already says what it shows. */}
              <Illustration name={slide.art} size="cover" style={styles.art} />
              <View style={{ height: sheetBelowArt }} />
            </>
          )}
        />

        <View style={[styles.sheet, { paddingBottom: sheetPadBottom }]} pointerEvents="box-none">
          <View style={styles.sheetShape} pointerEvents="none" />

          <View style={[styles.copyViewport, { height: copyHeight }]} pointerEvents="none">
            <Animated.View style={[styles.strip, { width: `${slides.length * 100}%` }, stripStyle]}>
              {slides.map((slide, i) => {
                const current = i === index;
                return (
                  // Only the slide on screen is announced: otherwise a screen reader
                  // reads six strings, and the E2E tree carries three titles.
                  <View
                    key={slide.art}
                    style={styles.copy}
                    accessibilityElementsHidden={!current}
                    importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
                  >
                    <View style={styles.titleBox}>
                      <Text
                        variant="heroTitle"
                        tone="cardForeground"
                        numberOfLines={2}
                        maxFontSizeMultiplier={1}
                        lineBreakStrategyIOS="push-out"
                        textBreakStrategy="balanced"
                        style={styles.title}
                      >
                        {slide.title}
                      </Text>
                    </View>
                    <Text
                      variant="heroBody"
                      tone="soft"
                      numberOfLines={bodyLines}
                      maxFontSizeMultiplier={BODY_MAX_SCALE}
                      style={styles.centred}
                    >
                      {slide.body}
                    </Text>
                  </View>
                );
              })}
            </Animated.View>
          </View>

          <View style={styles.footer} pointerEvents="box-none">
            <View style={styles.dots}>
              <Dots count={slides.length} index={index} variant="soft" decorative />
            </View>
            <View style={styles.buttons}>
              <Button label={t('getStarted')} size="lg" fullWidth onPress={enter} testID="welcome-start" />
              <Button
                label={t('signIn')}
                variant="secondary"
                size="lg"
                fullWidth
                onPress={enter}
                testID="welcome-signin"
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Behind everything, and the only thing visible either side of the column on a tablet.
  root: { flex: 1, backgroundColor: colors.background },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  // The whole column, not just the art: a swipe that starts on the copy has to
  // find this ScrollView under it.
  carousel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  art: { flex: 1 },

  // Bottom-anchored and as tall as its content. `box-none` on this and on the
  // footer: the sheet must never be the target of a touch, or it swallows swipes.
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: SHEET_PAD_TOP },
  sheetShape: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: sheetRadius,
    borderTopRightRadius: sheetRadius,
  },

  copyViewport: { overflow: 'hidden' },
  strip: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  copy: { flex: 1, paddingHorizontal: SHEET_PAD_X },
  titleBox: { height: TITLE_BLOCK, justifyContent: 'center', marginBottom: TITLE_BODY_GAP },
  title: { textAlign: 'center', alignSelf: 'center', maxWidth: TITLE_MAX_WIDTH },
  centred: { textAlign: 'center' },

  footer: { paddingHorizontal: SHEET_PAD_X, marginTop: COPY_TO_DOTS },
  dots: { alignItems: 'center', height: DOT_SIZE },
  buttons: { marginTop: DOTS_TO_BUTTONS, gap: BUTTON_GAP },
});
