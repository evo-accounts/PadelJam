/**
 * React Native's `Text` and `TextInput`, with the app's face already on them.
 *
 * RN has no global default font: every `Text` and `TextInput` renders in the
 * OS system face unless its own style names a family. `ui/Text` gets Outfit from
 * its type roles, but 28 files still render raw `Text` with hand-written sizes,
 * and every input is a raw `TextInput`. Importing these instead is the whole
 * migration for those files — the props, refs and styles are RN's own, and a
 * style that names a family (or `type.heroTitle`'s Atelia) still wins, because
 * the default goes FIRST in the style array.
 *
 * `eslint.config.mjs` rejects `Text` and `TextInput` from 'react-native'
 * everywhere except this file, so a new screen cannot drift back to the system
 * face without the lint failing.
 */
import type { ComponentPropsWithRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';

import { font } from '../../theme';

const base = StyleSheet.create({ face: { fontFamily: font.sans } });

export function Text({ style, ...props }: ComponentPropsWithRef<typeof RNText>) {
  return <RNText {...props} style={[base.face, style]} />;
}

export function TextInput({ style, ...props }: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput {...props} style={[base.face, style]} />;
}

/** The instance type, so `useRef<TextInput>(null)` reads as it always did. */
export type TextInput = RNTextInput;

export type { TextProps, TextInputProps } from 'react-native';
