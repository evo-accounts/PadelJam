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
 */
import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from 'react-native';

import { space } from '../../theme';
import { pageIndex } from './carouselPage';
import { Dots } from './Dots';

export type CarouselProps<T> = {
  data: readonly T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Controlled page. Omit for uncontrolled. */
  index?: number;
  onIndexChange?: (index: number) => void;
  showDots?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Carousel<T>({
  data,
  renderItem,
  index,
  onIndexChange,
  showDots = true,
  style,
  testID,
}: CarouselProps<T>) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [ownIndex, setOwnIndex] = useState(0);
  const controlled = index !== undefined;
  const current = Math.min(controlled ? index : ownIndex, Math.max(data.length - 1, 0));

  // A controlled caller changing `index` has to move the ScrollView; a swipe
  // does not, because the ScrollView has already moved itself (this then runs
  // with an offset it is already at, which is a no-op). `width` is a dependency
  // on purpose: after a rotation the same page sits at a different offset, and
  // without re-scrolling the carousel lands between two pages.
  useEffect(() => {
    if (width <= 0) return;
    scroller.current?.scrollTo({ x: current * width, animated: true });
  }, [current, width]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageIndex(e.nativeEvent.contentOffset.x, width, data.length);
    if (next === current) return;
    if (!controlled) setOwnIndex(next);
    onIndexChange?.(next);
  };

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {data.map((item, i) => (
          <View key={`page-${i}`} style={{ width }}>
            {renderItem(item, i)}
          </View>
        ))}
      </ScrollView>

      {showDots ? <Dots count={data.length} index={current} style={styles.dots} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
  dots: { alignSelf: 'center', marginTop: space[4] },
});
