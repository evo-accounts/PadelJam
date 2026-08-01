import { useCommunity } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, palette } from '../../../theme';

export default function CommunityQrModal() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: community } = useCommunity(id);

  const [copied, setCopied] = useState(false);
  const deepLink = `padeljam://community/${id}`;

  const onCopy = async () => {
    await Clipboard.setStringAsync(deepLink);
    setCopied(true);
  };

  const onShare = async () => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(deepLink);
    } else {
      await Clipboard.setStringAsync(deepLink);
      setCopied(true);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.body}>
        {community?.name ? <Text style={styles.communityName}>{community.name}</Text> : null}
        <Text style={styles.title}>{t('qrTitle')}</Text>
        <Text style={styles.subtitle}>{t('qrBody')}</Text>

        <View style={styles.qrWrapper}>
          <QRCode value={deepLink} size={240} />
        </View>

        <Text style={styles.link}>{deepLink}</Text>

        <View style={styles.actions}>
          <Pressable style={styles.button} onPress={onShare} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('share')}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onCopy} accessibilityRole="button">
            <Text style={styles.secondaryText}>{copied ? t('linkCopied') : t('copyLink')}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  body: { padding: 24, gap: 16, alignItems: 'center' },
  communityName: { fontSize: 18, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.mutedForeground, lineHeight: 21, textAlign: 'center' },
  qrWrapper: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  link: { fontSize: 13, color: palette.slate[400], textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 12, marginTop: 8 },
  button: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.foreground,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
});
