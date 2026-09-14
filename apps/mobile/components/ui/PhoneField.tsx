/**
 * PhoneField — a country selector welded to a `Field`, for the one input that
 * cannot be a plain text box: a phone number.
 *
 * The two controls are deliberately the same height and corner radius so the row
 * reads as ONE control rather than a dropdown that happens to sit next to a box
 * — the same geometry-from-`Field` approach `PasswordField` uses for its eye,
 * and for the same reason: derived from `Field`'s own layout constants, not
 * eyeballed.
 *
 * WHY ITS OWN SHEET, and not `useActionSheet`. `SheetHost` renders a flat list
 * of `SheetRow`s with no search and no virtualisation. There are 245 countries.
 * A user in Portugal would scroll past two hundred rows to reach theirs, and the
 * action-sheet API has nowhere to put a search box. So this composes
 * `BottomSheet` directly — search `Field` on top, `FlatList` of `SheetRow`
 * underneath — and leaves `SheetHost` for what it is good at.
 *
 * VALUE CONTRACT. `value` is E.164 or ''. It is never a half-typed number: the
 * digits live here until they form a valid number for the selected region, and
 * only then does the caller see anything. The formatting, the region and the
 * national digits all ride along in `onChangeValue`'s second argument so a
 * screen does not have to re-derive them.
 */
import { useT } from '@padel/i18n';
import * as Localization from 'expo-localization';
import type { CountryCode } from 'libphonenumber-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, space, type as typeScale } from '../../theme';
import {
  COUNTRIES,
  defaultRegion as deviceDefaultRegion,
  flagEmoji,
  formatNationalAsYouType,
  isValidFor,
  parseE164,
  placeholderFor,
  searchCountries,
  toE164,
  type Country,
} from '@/lib/countries';
import { BottomSheet } from './BottomSheet';
import { Field } from './Field';
import { SheetRow } from './SheetRow';
import { Text } from './Text';

export type PhoneFieldProps = {
  /** E.164, or '' while incomplete. */
  value: string;
  onChangeValue: (e164: string, meta: { region: CountryCode; national: string; valid: boolean }) => void;
  label?: string;
  error?: string | null;
  hint?: string | null;
  /**
   * Fires when the number input loses focus. A form that gates its submit on a
   * complete number needs SOMEWHERE to say why the button is still disabled,
   * and `value` alone cannot tell "nothing typed" from "half a number" — both
   * are ''. The meta from the last `onChangeValue` is what the caller inspects;
   * this is only the moment to inspect it.
   */
  onBlur?: () => void;
  /** Defaults to the device region, then 'PT'. */
  defaultRegion?: CountryCode;
  editable?: boolean;
  autoFocus?: boolean;
  containerStyle?: ViewStyle;
  testID?: string;
};

// `Field`'s input is a fixed 44pt tall (see Field.tsx `styles.input.minHeight`).
const INPUT_HEIGHT = 44;
// `Field`'s label row: the `label` type role's line height plus the `space[1]`
// margin it carries before the input. Pushing the selector down by this keeps it
// level with the INPUT rather than with the label-plus-input block.
const LABEL_HEIGHT = typeScale.label.lineHeight + space[1];
// The sheet is bottom-anchored and the search box must stay visible above the
// keyboard, so the list is capped rather than left to size itself to 245 rows.
const LIST_MAX_HEIGHT = 360;

const digitsOf = (s: string) => s.replace(/\D/g, '');

export function PhoneField({
  value,
  onChangeValue,
  label,
  error,
  hint,
  onBlur,
  defaultRegion,
  editable = true,
  autoFocus = false,
  containerStyle,
  testID,
}: PhoneFieldProps) {
  const { t } = useT('auth');

  // An incoming `value` wins over the prop, which wins over the device — a
  // screen that loads an existing '+55…' must not open showing 🇵🇹.
  const [region, setRegion] = useState<CountryCode>(
    () => parseE164(value)?.region ?? defaultRegion ?? deviceDefaultRegion(Localization.getLocales()),
  );
  const [national, setNational] = useState<string>(() => {
    const parsed = parseE164(value);
    return parsed ? formatNationalAsYouType(parsed.national, parsed.region) : '';
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // What we last handed UP. `value` coming back the same is our own emission
  // echoing through the caller's state; anything else is the caller re-seeding.
  const emitted = useRef(value);

  // Form hydration — the case `apps/mobile/eslint.config.mjs` documents as the
  // deliberate `react-hooks/set-state-in-effect` exemption. A profile screen
  // fetches the stored number after mount, and the alternatives (a `key`
  // remount, or deriving during render) both risk discarding digits the user is
  // mid-way through typing. The `emitted` guard is what stops our own output
  // from bouncing back and reformatting the input under the cursor.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    const parsed = value ? parseE164(value) : null;
    if (parsed) {
      setRegion(parsed.region);
      setNational(formatNationalAsYouType(parsed.national, parsed.region));
    } else {
      setNational('');
    }
  }, [value]);

  const emit = (nextNational: string, nextRegion: CountryCode) => {
    const digits = digitsOf(nextNational);
    const e164 = toE164(digits, nextRegion);
    emitted.current = e164 ?? '';
    onChangeValue(e164 ?? '', { region: nextRegion, national: digits, valid: isValidFor(digits, nextRegion) });
  };

  const onChangeText = (text: string) => {
    let digits = digitsOf(text);
    // Backspacing over a separator would otherwise be a no-op: the digits are
    // unchanged, so AsYouType puts the space or bracket straight back and the
    // cursor never moves. If the text SHRANK without losing a digit, the user
    // meant to delete the digit behind it.
    if (text.length < national.length && digits === digitsOf(national)) digits = digits.slice(0, -1);
    setNational(formatNationalAsYouType(digits, region));
    emit(digits, region);
  };

  const selectCountry = (code: CountryCode) => {
    const digits = digitsOf(national);
    setRegion(code);
    setNational(formatNationalAsYouType(digits, code));
    setOpen(false);
    setQuery('');
    emit(digits, code);
  };

  const current: Country = useMemo(
    () => COUNTRIES.find((c) => c.code === region) ?? { code: region, dialCode: '', name: region, flag: flagEmoji(region) },
    [region],
  );
  const results = useMemo(() => searchCountries(query), [query]);
  // Building an example number means parsing one; not worth redoing on every
  // keystroke when it only changes with the region.
  const placeholder = useMemo(() => placeholderFor(region), [region]);

  const ids = testID ?? 'phone-field';

  return (
    <View style={containerStyle}>
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={[t('countryCodeLabel'), current.name, current.dialCode].filter(Boolean).join(', ')}
          accessibilityState={{ disabled: !editable, expanded: open }}
          style={({ pressed }) => [
            styles.selector,
            label ? styles.selectorWithLabel : null,
            !editable && styles.selectorDisabled,
            pressed && styles.selectorPressed,
          ]}
          testID={`${ids}-country`}
        >
          <Text variant="body">{current.flag}</Text>
          <Text variant="caption" tone="muted">
            ▾
          </Text>
          <Text variant="body" tone="default">
            {current.dialCode}
          </Text>
        </Pressable>

        <Field
          label={label}
          value={national}
          onChangeText={onChangeText}
          error={error}
          hint={hint}
          onBlur={onBlur}
          editable={editable}
          autoFocus={autoFocus}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder={placeholder}
          containerStyle={styles.field}
          testID={ids}
        />
      </View>

      <BottomSheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title={t('countrySheetTitle')}
        testID={`${ids}-country-sheet`}
      >
        <View style={styles.search}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder={t('countrySearchPlaceholder')}
            accessibilityLabel={t('countrySearchPlaceholder')}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            testID={`${ids}-country-search`}
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(c) => c.code}
          style={styles.list}
          // Without this the first tap only dismisses the search keyboard, so
          // picking a country from a filtered list takes two taps.
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <SheetRow
              label={item.name}
              leading={<Text variant="body">{item.flag}</Text>}
              trailing={
                <Text variant="caption" tone="muted">
                  {item.dialCode}
                </Text>
              }
              selected={item.code === region}
              onPress={() => selectCountry(item.code)}
              testID={`${ids}-country-${item.code}`}
            />
          )}
          ListEmptyComponent={
            <Text variant="caption" tone="muted" style={styles.empty}>
              {t('countryNoResults')}
            </Text>
          }
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  field: { flex: 1 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    // Matched to Field's input, not chosen: same height, same radius, same
    // border and surface, so the pair reads as a single control.
    height: INPUT_HEIGHT,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
  },
  selectorWithLabel: { marginTop: LABEL_HEIGHT },
  selectorDisabled: { backgroundColor: colors.muted },
  selectorPressed: { opacity: 0.85 },
  search: { paddingHorizontal: space[2], marginBottom: space[2] },
  list: { maxHeight: LIST_MAX_HEIGHT },
  empty: { paddingHorizontal: space[3], paddingVertical: space[4] },
});
