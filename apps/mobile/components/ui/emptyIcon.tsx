/**
 * The one decorative icon every `EmptyState` site shares.
 *
 * SF Symbol names and Material Symbol names do not line up — `expo-symbols`
 * types `name.ios`/`name.android`/`name.web` as closed string-literal unions
 * (`SFSymbol` / `AndroidSymbol`) drawn from two different icon sets, so a
 * single string cannot be "verbatim" on both platforms the way the tab bar
 * comment used to claim. `app/(tabs)/_layout.tsx` already picks a distinct
 * name per platform for every tab icon (e.g. `person.2.fill` / `group`); this
 * does the same for the empty-state icon, via a typed lookup keyed by the SF
 * name callers already pass. `android` doubles as the `web` name, matching
 * that same convention.
 *
 * Each pair is name-checked against `sf-symbols-typescript`'s `SFSymbol`
 * union (ios) and `expo-symbols`' generated Material Symbol map (android/web)
 * at review time — `EmptyIconName` is the closed set of icons in use, so a
 * typo here is a type error at the call site rather than a silent blank icon
 * on Android.
 *
 * Always `accessibilityElementsHidden` + `importantForAccessibility="no"`:
 * it restates the title next to it, so a screen reader should skip it rather
 * than announce the picture and then the sentence.
 */
import { SymbolView } from 'expo-symbols';

import { colors } from '../../theme';

const ICONS = {
  calendar: { sf: 'calendar', android: 'calendar_month' },
  trophy: { sf: 'trophy', android: 'emoji_events' },
  magnifyingglass: { sf: 'magnifyingglass', android: 'search' },
  'bubble.left.and.bubble.right': { sf: 'bubble.left.and.bubble.right', android: 'forum' },
  'person.2': { sf: 'person.2', android: 'group' },
  'person.3': { sf: 'person.3', android: 'groups' },
  bell: { sf: 'bell', android: 'notifications' },
  'person.badge.clock': { sf: 'person.badge.clock', android: 'pending_actions' },
  'text.bubble': { sf: 'text.bubble', android: 'chat' },
  'bubble.left': { sf: 'bubble.left', android: 'chat_bubble' },
  megaphone: { sf: 'megaphone', android: 'campaign' },
  clock: { sf: 'clock', android: 'schedule' },
  sportscourt: { sf: 'sportscourt', android: 'sports_tennis' },
  mappin: { sf: 'mappin', android: 'location_on' },
  photo: { sf: 'photo', android: 'photo' },
  star: { sf: 'star', android: 'star' },
  'exclamationmark.triangle': { sf: 'exclamationmark.triangle', android: 'warning' },
  'person.crop.circle.badge.checkmark': {
    sf: 'person.crop.circle.badge.checkmark',
    android: 'how_to_reg',
  },
} as const satisfies Record<string, { sf: string; android: string }>;

export type EmptyIconName = keyof typeof ICONS;

export const emptyIcon = (name: EmptyIconName) => {
  const { sf, android } = ICONS[name];
  return (
    <SymbolView
      name={{ ios: sf, android, web: android } as never}
      size={40}
      tintColor={colors.mutedForeground}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
};
