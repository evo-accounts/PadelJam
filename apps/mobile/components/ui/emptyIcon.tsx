/**
 * The one decorative icon every `EmptyState` site shares.
 *
 * Callers pass a plain SF Symbol name string (also used verbatim as the
 * Android/web material icon name — see the convention in
 * `app/(tabs)/_layout.tsx`); `expo-symbols` types `name.ios`/`name.android`/
 * `name.web` as closed string-literal unions (`SFSymbol` / `AndroidSymbol`),
 * so a generic `string` needs the same escape hatch call sites already use for
 * `expo-router`'s equally-closed route unions (`as never`).
 *
 * Always `accessibilityElementsHidden` + `importantForAccessibility="no"`:
 * it restates the title next to it, so a screen reader should skip it rather
 * than announce the picture and then the sentence.
 */
import { SymbolView } from 'expo-symbols';

import { colors } from '../../theme';

export const emptyIcon = (name: string) => (
  <SymbolView
    name={{ ios: name, android: name, web: name } as never}
    size={40}
    tintColor={colors.mutedForeground}
    accessibilityElementsHidden
    importantForAccessibility="no"
  />
);
