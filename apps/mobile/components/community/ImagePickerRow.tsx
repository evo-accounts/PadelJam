import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from '../ui';
import { colors, palette } from '../../theme';

export function ImagePickerRow({
  label,
  variant,
  uri,
  onPress,
  disabled,
}: {
  label: string;
  variant: 'square' | 'cover';
  uri: string | null;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useT('community');
  const previewStyle = variant === 'square' ? styles.previewSquare : styles.previewCover;
  return (
    <View style={styles.container}>
      <Text variant="caption" tone="muted" style={styles.label}>
        {label}
      </Text>
      {/* Stays a Pressable: a large image drop-target is not Button's shape.
          But it had NO accessibilityLabel, and once a `uri` is set its only
          child is an <Image> — so the control had no accessible name at all,
          which is worse than the glyph-only case the lint rule covers. The name
          now says what tapping DOES and which field it belongs to. */}
      <Pressable
        style={[styles.preview, previewStyle, !uri && styles.previewEmpty]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${uri ? t('changeImage') : t('addImage')}: ${label}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" />
        ) : (
          <Text variant="caption" style={styles.placeholder}>
            {t('addImage')}
          </Text>
        )}
      </Pressable>
      {uri ? (
        <Button
          variant="ghost"
          size="sm"
          label={t('changeImage')}
          onPress={onPress}
          disabled={disabled}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { marginBottom: 8 },
  preview: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmpty: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  previewSquare: { width: 96, height: 96 },
  previewCover: { width: '100%', aspectRatio: 16 / 9 },
  image: { width: '100%', height: '100%' },
  // Colour only — the size comes from the `caption` variant.
  placeholder: { color: palette.slate[400] },
});
