/**
 * Carousel — a horizontal pager with a Dots row under it.
 *
 * MEASURES ITSELF. `welcome.tsx` reads `Dimensions.get('window')` once at module
 * scope, which is wrong twice over: the value is captured before the component
 * ever mounts, and it never changes again — so after a rotation the pages are
 * still laid out at the portrait width and `Math.round(offset / width)` reports
 * the wrong page. `onLayout` gives the width of THIS component, in its current
 * orientation, inside whatever padding its parent applies.
 *
 * Controlled or uncontrolled, like an input: pass `index` to drive it from
 * outside (a "Next" button), omit it and the carousel keeps its own page.
 *
 * A SWIPE IS NEVER ANSWERED WITH A SCROLL. `current` follows the finger: it
 * flips at the half-way rounding threshold while the drag is still in progress.
 * The effect below moves the ScrollView whenever `current` changes, so without
 * the `swipedTo` bookkeeping it would issue an animated `scrollTo` against the
 * user's own finger at exactly that moment. The decision lives in
 * `carouselPage.ts` (`shouldScrollTo`) because it is arithmetic, and is tested
 * there.
 *
 * THE THREE ADDITIVE PROPS (`bounces`, `scrollX`, `initialWidth`) exist for a
 * pager whose neighbours have to move with it. A screen that draws something
 * ELSE in lock-step with the pages — the welcome screen's copy strip, which has
 * to sit above a fixed layer the pages cannot straddle — needs the scroll offset
 * on the UI thread, every frame, not a JS round trip that arrives a frame late.
 * Every one defaults to the old behaviour, so a caller that passes none of them
 * gets exactly the carousel it always had.
 */
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset, type SharedValue } from 'react-native-reanimated';

import { space } from '../../theme';
import { pageIndex, shouldScrollTo } from './carouselPage';
import { Dots } from './Dots';

export type CarouselProps<T> = {
  data: readonly T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Controlled page. Omit for uncontrolled. */
  index?: number;
  onIndexChange?: (index: number) => void;
  showDots?: boolean;
  /**
   * Rubber-band past the first and last page. Default `true`, as before. Off, the
   * pager stops dead at either end — which is what a pager needs when something
   * else is positioned from its offset and must never see a negative one (iOS
   * `bounces`; Android `overScrollMode`).
   */
  bounces?: boolean;
  /**
   * A shared value the carousel keeps equal to its horizontal scroll offset, in
   * points, updated on the UI thread as the ScrollView moves. Read it inside
   * `useAnimatedStyle` to drive a neighbour natively; read it nowhere on the JS
   * thread (`.get()` there is a synchronous bridge hop per call).
   */
  scrollX?: SharedValue<number>;
  /**
   * The page width to lay out at until the first `onLayout` reports the real one.
   * Without it the pages are 0 wide for a frame and whatever they hold pops in —
   * visible on a full-bleed image. A good guess costs nothing: `onLayout` reports
   * the same number and the state bails.
   */
  initialWidth?: number;
  style?: ViewStyle;
  testID?: string;
};

export function Carousel<T>({
  data,
  renderItem,
  index,
  onIndexChange,
  showDots = true,
  bounces = true,
  scrollX,
  initialWidth,
  style,
  testID,
}: CarouselProps<T>) {
  const scroller = useAnimatedRef<Animated.ScrollView>();
  // Feeds `scrollX` from the native scroll events. With no `scrollX` it fills a
  // private one nobody reads, which is a no-op cost, so the hook can stay
  // unconditional.
  useScrollOffset(scroller, scrollX);

  const [width, setWidth] = useState(initialWidth ?? 0);
  const [ownIndex, setOwnIndex] = useState(0);
  // The page the user's finger last took the ScrollView to — see the header.
  const swipedTo = useRef<number | null>(null);
  const controlled = index !== undefined;
  const current = Math.min(controlled ? index : ownIndex, Math.max(data.length - 1, 0));

  // A controlled caller changing `index` has to move the ScrollView; a swipe
  // does not, because the ScrollView has already moved itself — and, mid-drag,
  // is not at a page offset at all, which is why the swipe's own change of
  // `current` is skipped rather than answered. `width` is a dependency on
  // purpose: after a rotation the same page sits at a different offset, and
  // without re-scrolling the carousel lands between two pages.
  //
  // `swipedTo` is cleared on EVERY run, not only a skip: left set, a later
  // "Back" to that page would be mistaken for the user's own swipe.
  useEffect(() => {
    if (width <= 0) return;
    const scroll = shouldScrollTo(current, swipedTo.current);
    swipedTo.current = null;
    if (!scroll) return;
    scroller.current?.scrollTo({ x: current * width, animated: true });
  }, [current, width, scroller]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageIndex(e.nativeEvent.contentOffset.x, width, data.length);
    if (next === current) return;
    swipedTo.current = next;
    if (!controlled) setOwnIndex(next);
    onIndexChange?.(next);
  };

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID}>
      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        bounces={bounces}
        overScrollMode={bounces ? 'auto' : 'never'}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        // 16ms is one frame at 60Hz, which is all the JS `onScroll` needs. A
        // neighbour driven from `scrollX` is only as smooth as the events it is
        // fed, though, and on a 120Hz display a 16ms throttle samples the scroll at
        // half the rate it is drawn — the neighbour then judders against the pages.
        scrollEventThrottle={scrollX ? 1 : 16}
      >
        {data.map((item, i) => (
          <View key={`page-${i}`} style={{ width }}>
            {renderItem(item, i)}
          </View>
        ))}
      </Animated.ScrollView>

      {showDots ? <Dots count={data.length} index={current} style={styles.dots} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  dots: { alignSelf: 'center', marginTop: space[4] },
});
