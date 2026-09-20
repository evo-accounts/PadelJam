/**
 * The community QR code (UX-COMM-03) — a bottom sheet, not the full screen it
 * used to be at `community/[id]/qr`.
 *
 * Share and Copy Link are deliberately NOT here. They sit on the screen behind
 * this sheet, and repeating them gave the same link three ways out of two
 * surfaces. The one action left is Download, which nothing else offers.
 */
import { useT } from '@padel/i18n';
import * as MediaLibrary from 'expo-media-library';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';

import { communityDeepLink } from '@/lib/communityShare';
import { palette, radius, space } from '../../theme';
import { BottomSheet, Button, Text, useBanner } from '../ui';

export function QrSheet({
  visible,
  onClose,
  communityId,
}: {
  visible: boolean;
  onClose: () => void;
  communityId: string;
}) {
  const { t } = useT('community');
  const banner = useBanner();
  const shot = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const link = communityDeepLink(communityId);

  const onDownload = async () => {
    try {
      // Asked at the moment of use rather than on mount: the sheet is worth
      // opening just to show someone the code, which needs no permission.
      const { granted } = await MediaLibrary.requestPermissionsAsync();
      if (!granted) {
        banner.show(t('qrDownloadDenied'));
        return;
      }
      const uri = await shot.current?.capture?.();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      banner.show(t('qrDownloaded'), 'success');
    } catch {
      banner.show(t('qrDownloadFailed'));
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('qrTitle')} testID="qr-sheet">
      <View style={styles.body}>
        {/* `palette.white`, not a semantic token: this quiet zone must stay light
            in dark mode too, or the saved image is a dark-on-dark code that no
            scanner reads. One of the rare cases the raw ramp is the right answer. */}
        <ViewShot ref={shot} options={{ format: 'png', quality: 1 }}>
          <View style={styles.code}>
            <QRCode value={link} size={220} />
          </View>
        </ViewShot>

        <Text variant="caption" tone="muted" style={styles.link}>
          {link}
        </Text>

        <Button
          label={t('qrDownload')}
          variant="secondary"
          fullWidth
          onPress={() => void onDownload()}
          testID="qr-download"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space[3], paddingBottom: space[2] },
  code: { backgroundColor: palette.white, padding: space[3], borderRadius: radius.lg },
  link: { textAlign: 'center' },
});
