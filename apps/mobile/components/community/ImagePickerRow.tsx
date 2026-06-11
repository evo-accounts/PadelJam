import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.preview, previewStyle, !uri && styles.previewEmpty]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
      >
        {uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" />
        ) : (
          <Text style={styles.placeholder}>{t('addImage')}</Text>
        )}
      </Pressable>
      {uri ? (
        <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button">
          <Text style={styles.change}>{t('changeImage')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, color: '#444', marginBottom: 8 },
  preview: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F5FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmpty: { borderWidth: 1, borderColor: '#ccc', borderStyle: 'dashed' },
  previewSquare: { width: 96, height: 96 },
  previewCover: { width: '100%', aspectRatio: 16 / 9 },
  image: { width: '100%', height: '100%' },
  placeholder: { color: '#888', fontSize: 13 },
  change: { color: '#0B1F3A', fontSize: 13, fontWeight: '600', marginTop: 8 },
});
