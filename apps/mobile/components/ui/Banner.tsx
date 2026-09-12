/**
 * Banner — the response to a tap that failed (UX-GLOB-06). Mounted ONCE by BannerProvider,
 * pinned under the status bar above the navigator, outside any scroll view, so it is visible
 * regardless of scroll position. Auto-dismisses after 4 s or on the next touch anywhere.
 *
 *   const banner = useBanner();
 *   banner.show(t('missingInformation', { ns: 'common' }));
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { BannerTimer, type BannerState } from './bannerTimer';
import { Text } from './Text';

const AUTO_DISMISS_MS = 4000;

type Ctx = { show: (message: string, tone?: 'error' | 'success') => void };
const BannerContext = createContext<Ctx | null>(null);

export function BannerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BannerState>(null);
  const [timer] = useState(() => new BannerTimer(AUTO_DISMISS_MS, setState));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (state) AccessibilityInfo.announceForAccessibility(state.message);
  }, [state]);

  // Unmounting mid-timeout must not fire setState on a gone component.
  useEffect(() => () => timer.dismiss(), [timer]);

  const ctx = useMemo<Ctx>(() => ({ show: (message, tone = 'error') => timer.show(message, tone) }), [timer]);

  return (
    <BannerContext.Provider value={ctx}>
      {/* Capture-phase touch anywhere dismisses; the touch still reaches its target. */}
      <View style={styles.root} onStartShouldSetResponderCapture={() => { timer.dismiss(); return false; }}>
        {children}
        {state ? (
          <View
            pointerEvents="none"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="banner"
            style={[styles.banner, { top: insets.top + space[2] }, state.tone === 'success' ? styles.success : styles.error]}
          >
            <Text variant="bodyStrong" tone="inverse" numberOfLines={2}>
              {state.message}
            </Text>
          </View>
        ) : null}
      </View>
    </BannerContext.Provider>
  );
}

export function useBanner(): Ctx {
  const ctx = useContext(BannerContext);
  if (!ctx) throw new Error('useBanner needs BannerProvider above it');
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: {
    position: 'absolute',
    left: space[4],
    right: space[4],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  error: { backgroundColor: colors.destructive },
  success: { backgroundColor: colors.successStrong },
});
